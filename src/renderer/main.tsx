import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { KeygenApp } from "./KeygenApp";
import "./styles.css";

const mode = new URLSearchParams(window.location.search).get("mode");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{mode === "keygen" ? <KeygenApp /> : <App />}</React.StrictMode>,
);
