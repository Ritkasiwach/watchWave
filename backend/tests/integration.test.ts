import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { io as ioc, Socket } from 'socket.io-client';
import { server } from '../src/server';

let url = '';
const clients: Socket[] = [];

before(async () => {
  await new Promise<void>(resolve => server.listen(0, resolve));
  url = `http://localhost:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  clients.forEach(c => c.disconnect());
  await new Promise(resolve => server.close(resolve));
});

const connect = (): Promise<Socket> =>
  new Promise(resolve => {
    const s = ioc(url, { transports: ['websocket'], forceNew: true });
    clients.push(s);
    s.on('connect', () => resolve(s));
  });

const emitAck = (s: Socket, event: string, payload?: unknown): Promise<any> =>
  new Promise(resolve => (payload === undefined ? s.emit(event, resolve) : s.emit(event, payload, resolve)));

const waitFor = <T = any>(s: Socket, event: string, ms = 1500): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout waiting for "${event}"`)), ms);
    s.once(event, (d: T) => { clearTimeout(t); resolve(d); });
  });

/** Assert that an event does NOT arrive within a short window. */
const expectSilence = (s: Socket, event: string, ms = 250): Promise<void> =>
  new Promise((resolve, reject) => {
    const h = () => reject(new Error(`unexpected "${event}"`));
    s.once(event, h);
    setTimeout(() => { s.off(event, h); resolve(); }, ms);
  });

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function setupRoom(joiners: string[] = ['Bob']) {
  const host = await connect();
  const created = await emitAck(host, 'create_room', { username: 'Alice' });
  const others: Socket[] = [];
  for (const name of joiners) {
    const s = await connect();
    const res = await emitAck(s, 'join_room', { roomId: created.roomId, username: name });
    assert.equal(res.ok, true, `join failed for ${name}`);
    others.push(s);
  }
  return { host, others, roomId: created.roomId as string };
}

test('create room makes creator Host; joiner is Participant and others are notified', async () => {
  const host = await connect();
  const created = await emitAck(host, 'create_room', { username: 'Alice' });
  assert.equal(created.ok, true);
  assert.match(created.roomId, /^[A-Z0-9]{6}$/);
  assert.equal(created.user.role, 'Host');

  const joined = waitFor(host, 'user_joined');
  const bob = await connect();
  const res = await emitAck(bob, 'join_room', { roomId: created.roomId.toLowerCase(), username: 'Bob' });
  assert.equal(res.user.role, 'Participant');

  const evt = await joined;
  assert.equal(evt.username, 'Bob');
  assert.equal(evt.role, 'Participant');
  assert.equal(evt.participants.length, 2);
  assert.deepEqual(evt.participants.map((p: any) => p.role), ['Host', 'Participant']);
});

test('join validation: missing room, duplicate name, bad username', async () => {
  const { roomId } = await setupRoom();
  const c = await connect();
  assert.equal((await emitAck(c, 'join_room', { roomId: 'ZZZZZZ', username: 'X' })).code, 'ROOM_NOT_FOUND');
  assert.equal((await emitAck(c, 'join_room', { roomId, username: '   ' })).code, 'INVALID_USERNAME');
  assert.equal((await emitAck(c, 'join_room', { roomId, username: 'x'.repeat(21) })).code, 'INVALID_USERNAME');
  assert.equal((await emitAck(c, 'create_room', {})).code, 'INVALID_USERNAME');
});

test('late joiner receives current video state (room_state + sync_state)', async () => {
  const { host, roomId } = await setupRoom([]);
  host.emit('change_video', { videoId: 'aqz-KE-bpKQ' });
  host.emit('seek', { time: 30 });
  host.emit('play', { time: 30 });
  await sleep(1100);

  const late = await connect();
  const state = waitFor(late, 'room_state');
  const sync = waitFor(late, 'sync_state');
  await emitAck(late, 'join_room', { roomId, username: 'Late' });
  const [rs, ss] = [await state, await sync];
  assert.equal(rs.videoState.videoId, 'aqz-KE-bpKQ');
  assert.equal(ss.playState, 'playing');
  assert.ok(ss.currentTime >= 30.9 && ss.currentTime < 33, `extrapolated time was ${ss.currentTime}`);
});

test('Host playback events are broadcast to everyone', async () => {
  const { host, others } = await setupRoom(['Bob', 'Cara']);
  for (const [evt, payload, expected] of [
    ['play', { time: 12 }, { time: 12 }],
    ['seek', { time: 99 }, { time: 99 }],
    ['pause', { time: 99 }, { time: 99 }],
    ['change_video', { videoId: 'jNQXAC9IVRw' }, { videoId: 'jNQXAC9IVRw' }]
  ] as const) {
    const waits = [host, ...others].map(s => waitFor(s, evt));
    host.emit(evt, payload);
    for (const w of waits) assert.deepEqual({ ...(await w), by: undefined }, { ...expected, by: undefined });
  }
});

test('Participants cannot control playback (server rejects and state is unchanged)', async () => {
  const { host, others: [bob] } = await setupRoom();
  for (const [evt, payload] of [['play', { time: 5 }], ['pause', { time: 5 }], ['seek', { time: 5 }], ['change_video', { videoId: 'jNQXAC9IVRw' }]] as const) {
    const err = waitFor(bob, 'socket_error');
    const silent = expectSilence(host, evt);
    bob.emit(evt, payload);
    assert.equal((await err).code, 'PERMISSION_DENIED', evt);
    await silent;
  }
});

test('invalid video ids / times are rejected', async () => {
  const { host } = await setupRoom([]);
  const err = waitFor(host, 'socket_error');
  host.emit('change_video', { videoId: 'not a video' });
  assert.equal((await err).code, 'INVALID_VIDEO');
  const silent = expectSilence(host, 'seek');
  host.emit('seek', { time: -5 });
  host.emit('seek', { time: 'abc' });
  await silent;
});

test('only Host can assign roles; Moderator gains and loses playback control', async () => {
  const { host, others: [bob, cara] } = await setupRoom(['Bob', 'Cara']);
  const bobId = bob.id!;

  // Participant cannot assign
  let err = waitFor(bob, 'socket_error');
  bob.emit('assign_role', { userId: cara.id, role: 'Moderator' });
  assert.equal((await err).code, 'PERMISSION_DENIED');

  // Host promotes Bob; everyone sees role_assigned with updated participants
  const notices = [host, bob, cara].map(s => waitFor(s, 'role_assigned'));
  host.emit('assign_role', { userId: bobId, role: 'Moderator' });
  for (const n of notices) {
    const d = await n;
    assert.equal(d.userId, bobId);
    assert.equal(d.role, 'Moderator');
    assert.equal(d.participants.find((p: any) => p.id === bobId).role, 'Moderator');
  }

  // Bob can now pause for the room
  const paused = waitFor(cara, 'pause');
  bob.emit('pause', { time: 7 });
  assert.equal((await paused).time, 7);

  // ...but a Moderator still cannot assign roles or remove people
  err = waitFor(bob, 'socket_error');
  bob.emit('remove_participant', { userId: cara.id });
  assert.equal((await err).code, 'PERMISSION_DENIED');

  // Demote back to Participant
  const demoted = waitFor(bob, 'role_assigned');
  host.emit('assign_role', { userId: bobId, role: 'Participant' });
  assert.equal((await demoted).role, 'Participant');
  err = waitFor(bob, 'socket_error');
  bob.emit('pause', { time: 1 });
  assert.equal((await err).code, 'PERMISSION_DENIED');

  // Cannot assign Host through assign_role, or touch the Host
  err = waitFor(host, 'socket_error');
  host.emit('assign_role', { userId: bobId, role: 'Host' });
  assert.equal((await err).code, 'INVALID_ROLE_ASSIGNMENT');
});

test('approval flow: participant requests, moderator/host approve or reject', async () => {
  const { host, others: [bob, cara] } = await setupRoom(['Bob', 'Cara']);

  // Bob requests a seek; Host sees it, Cara (participant) does not
  const hostList = waitFor(host, 'requests_updated');
  const submittedP = waitFor(bob, 'request_submitted');
  bob.emit('request_action', { type: 'seek', time: 42 });
  const submitted = await submittedP;
  const list = (await hostList).requests;
  assert.equal(list.length, 1);
  assert.equal(list[0].type, 'seek');
  assert.equal(list[0].username, 'Bob');
  assert.equal(submitted.request.id, list[0].id);

  // Nothing changed for the room yet
  await expectSilence(cara, 'seek');

  // Participants cannot resolve requests
  const err = waitFor(cara, 'socket_error');
  cara.emit('resolve_request', { requestId: list[0].id, approve: true });
  assert.equal((await err).code, 'PERMISSION_DENIED');

  // Host approves -> seek broadcast to all + request_resolved
  const seeks = [host, bob, cara].map(s => waitFor(s, 'seek'));
  const resolved = waitFor(bob, 'request_resolved');
  host.emit('resolve_request', { requestId: list[0].id, approve: true });
  for (const s of seeks) assert.equal((await s).time, 42);
  const r = await resolved;
  assert.equal(r.approved, true);
  assert.equal(r.userId, bob.id);

  // Second attempt on same request is rejected as stale
  const stale = waitFor(host, 'socket_error');
  host.emit('resolve_request', { requestId: list[0].id, approve: true });
  assert.equal((await stale).code, 'REQUEST_NOT_FOUND');

  // Reject path: no playback broadcast
  const l2p = waitFor(host, 'requests_updated');
  cara.emit('request_action', { type: 'change_video', videoId: 'jNQXAC9IVRw' });
  const l2 = (await l2p).requests;
  const rejected = waitFor(cara, 'request_resolved');
  const noChange = expectSilence(bob, 'change_video');
  host.emit('resolve_request', { requestId: l2[0].id, approve: false });
  assert.equal((await rejected).approved, false);
  await noChange;

  // Approve a play request via a Moderator
  host.emit('assign_role', { userId: bob.id, role: 'Moderator' });
  await waitFor(bob, 'role_assigned');
  const modList = waitFor(bob, 'requests_updated');
  cara.emit('request_action', { type: 'play' });
  const l3 = (await modList).requests;
  assert.equal(l3.length, 1);
  const played = waitFor(host, 'play');
  bob.emit('resolve_request', { requestId: l3[0].id, approve: true });
  assert.equal(typeof (await played).time, 'number');
});

test('request validation and limits; hosts cannot file requests', async () => {
  const { host, others: [bob] } = await setupRoom();
  let err = waitFor(host, 'socket_error');
  host.emit('request_action', { type: 'play' });
  assert.equal((await err).code, 'INVALID_REQUEST');

  err = waitFor(bob, 'socket_error');
  bob.emit('request_action', { type: 'explode' });
  assert.equal((await err).code, 'INVALID_REQUEST');

  err = waitFor(bob, 'socket_error');
  bob.emit('request_action', { type: 'change_video', videoId: 'bad' });
  assert.equal((await err).code, 'INVALID_VIDEO');

  for (let i = 0; i < 3; i++) bob.emit('request_action', { type: 'play' });
  await sleep(150);
  err = waitFor(bob, 'socket_error');
  bob.emit('request_action', { type: 'pause' });
  assert.equal((await err).code, 'TOO_MANY_REQUESTS');
});

test('Host can remove a participant; others cannot', async () => {
  const { host, others: [bob, cara] } = await setupRoom(['Bob', 'Cara']);

  let err = waitFor(bob, 'socket_error');
  bob.emit('remove_participant', { userId: cara.id });
  assert.equal((await err).code, 'PERMISSION_DENIED');

  err = waitFor(host, 'socket_error');
  host.emit('remove_participant', { userId: host.id });
  assert.equal((await err).code, 'INVALID_PARTICIPANT');

  const kicked = waitFor(cara, 'socket_error');
  const removed = waitFor(host, 'participant_removed');
  host.emit('remove_participant', { userId: cara.id });
  assert.equal((await kicked).code, 'KICKED');
  const d = await removed;
  assert.equal(d.userId, cara.id);
  assert.equal(d.participants.length, 2);

  // Removed user no longer receives room events or can control anything
  const silent = expectSilence(cara, 'pause');
  host.emit('pause', { time: 3 });
  await silent;
});

test('Host can transfer the Host role; old Host becomes Moderator', async () => {
  const { host, others: [bob] } = await setupRoom();
  const both = [host, bob].map(s => waitFor(s, 'host_transferred'));
  host.emit('transfer_host', { userId: bob.id });
  const d = await both[0];
  await both[1];
  assert.equal(d.newHostId, bob.id);
  const roles = Object.fromEntries(d.participants.map((p: any) => [p.username, p.role]));
  assert.deepEqual(roles, { Alice: 'Moderator', Bob: 'Host' });

  // Old host can no longer assign roles; new host can
  let err = waitFor(host, 'socket_error');
  host.emit('remove_participant', { userId: bob.id });
  assert.equal((await err).code, 'PERMISSION_DENIED');
  const ok = waitFor(bob, 'role_assigned');
  bob.emit('assign_role', { userId: host.id, role: 'Participant' });
  assert.equal((await ok).role, 'Participant');
});

test('when the Host leaves, the room promotes a Moderator (else oldest participant)', async () => {
  const { host, others: [bob, cara] } = await setupRoom(['Bob', 'Cara']);
  host.emit('assign_role', { userId: cara.id, role: 'Moderator' });
  await waitFor(bob, 'role_assigned');

  const promoted = waitFor(bob, 'host_transferred');
  const left = waitFor(bob, 'user_left');
  host.disconnect();
  const p = await promoted;
  assert.equal(p.newHostId, cara.id);
  assert.equal(p.reason, 'host_left');
  const l = await left;
  assert.equal(l.participants.length, 2);
  assert.equal(l.participants.find((x: any) => x.id === cara.id).role, 'Host');
});

test('empty rooms are deleted', async () => {
  const { host, roomId } = await setupRoom([]);
  host.emit('leave_room', {});
  await sleep(100);
  const c = await connect();
  assert.equal((await emitAck(c, 'join_room', { roomId, username: 'Z' })).code, 'ROOM_NOT_FOUND');
});

test('malformed payloads never crash the server', async () => {
  const { host, others: [bob] } = await setupRoom();
  for (const evt of ['assign_role', 'remove_participant', 'transfer_host', 'change_video', 'seek', 'play', 'request_action', 'resolve_request', 'join_room', 'create_room']) {
    host.emit(evt);
    host.emit(evt, null);
    host.emit(evt, 'garbage');
    bob.emit(evt, { userId: 42, role: {}, videoId: [], time: 'x', type: null });
  }
  await sleep(200);
  const c = await connect();
  const res = await emitAck(c, 'create_room', { username: 'StillAlive' });
  assert.equal(res.ok, true);
});
