import { LogoMark } from "./Icons.jsx";

const SUGGESTIONS = [
  "What are the top tech news headlines today?",
  "Explain how a transformer neural network works, simply.",
  "Plan a 3-day itinerary for Kyoto.",
  "What's the difference between TCP and UDP?",
];

export default function EmptyState({ ready, onPick, onConfigure }) {
  return (
    <div className="empty">
      <LogoMark size={56} />
      <h2>How can I help you today?</h2>
      <p>
        Ask anything. When a question needs fresh information, I'll search the web and
        cite my sources.
      </p>

      {ready ? (
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button key={s} className="suggestion" onClick={() => onPick(s)}>
              {s}
            </button>
          ))}
        </div>
      ) : (
        <button className="btn btn-primary btn-lg" onClick={onConfigure}>
          Add your API keys to get started
        </button>
      )}
    </div>
  );
}
