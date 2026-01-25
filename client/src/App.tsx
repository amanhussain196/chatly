import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './components/Home';
import Room from './components/Room/Room';
import { SocketProvider } from './context/SocketContext';

function App() {
  return (
    <SocketProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/room/:roomId" element={<Room />} />
        </Routes>
      </BrowserRouter>
    </SocketProvider>
  );
}

export default App;
