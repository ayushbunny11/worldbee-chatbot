import { Component } from "react";
import { clearSavedChat } from "../storage.js";
import { AlertIcon } from "./Icons.jsx";

// Shows a way out instead of a blank page if the app crashes while drawing.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="crash">
        <div className="error">
          <AlertIcon size={16} />
          <div>
            <strong>Something went wrong</strong>
            <p>{this.state.error.message}</p>
          </div>
        </div>
        <div className="crash-actions">
          <button className="btn btn-ghost" onClick={() => location.reload()}>
            Reload
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              clearSavedChat();
              location.reload();
            }}
          >
            Clear chat and reload
          </button>
        </div>
        <p className="crash-note">Clearing removes this chat. Your settings and files are kept.</p>
      </div>
    );
  }
}
