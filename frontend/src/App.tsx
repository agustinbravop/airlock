import { useState } from "react";
import Intro from "./components/Intro";
import Chat from "./components/Chat";

export default function App() {
  const [entered, setEntered] = useState(false);

  if (!entered) {
    return <Intro onEnter={() => setEntered(true)} />;
  }

  return <Chat />;
}
