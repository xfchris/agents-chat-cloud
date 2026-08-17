import { Route, Routes } from 'react-router-dom';
import { Landing } from './components/Landing';
import { ChatRoom } from './components/ChatRoom';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/r/:room" element={<ChatRoom />} />
    </Routes>
  );
}
