import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { SocketProvider } from './contexts/SocketContext';
import { Toaster } from 'react-hot-toast';
import Home from './pages/Home';
import Room from './pages/Room';

function App() {
  return (
    <BrowserRouter>
      <SocketProvider>
        <Toaster position="top-center" toastOptions={{ 
          style: { background: '#333', color: '#fff' } 
        }} />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/room/:roomId" element={<Room />} />
        </Routes>
      </SocketProvider>
    </BrowserRouter>
  );
}

export default App;
