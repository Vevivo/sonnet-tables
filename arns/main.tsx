import {createRoot} from "react-dom/client";
import Lobby from "../app/lobby";
import "../app/globals.css";
import "../app/neon-theme.css";
import "../app/participation.css";
import "../app/member-profile.css";

createRoot(document.getElementById("root")!).render(<Lobby/>);
