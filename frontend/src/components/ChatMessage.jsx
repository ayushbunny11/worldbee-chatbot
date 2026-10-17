import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertIcon, CheckIcon, LogoMark, SearchIcon } from "./Icons.jsx";

// Open links from the model in a new tab.
const markdownComponents = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
};

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// One web search the agent ran, with the sources it found.
function SearchStep({ step }) {
  return (
    <div className={`step ${step.done ? "done" : "running"}`}>
      <div className="step-head">
        {step.done ? <CheckIcon size={14} /> : <SearchIcon size={14} className="spin-pulse" />}
        <span>
          {step.done ? "Searched the web for" : "Searching the web for"} <strong>“{step.query}”</strong>
        </span>
      </div>
      {step.sources.length > 0 && (
        <div className="sources">
          {step.sources.map((s) => (
            <a key={s.url} className="source" href={s.url} target="_blank" rel="noopener noreferrer" title={s.title}>
              <img src={`https://www.google.com/s2/favicons?domain=${hostname(s.url)}&sz=32`} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
              <span>{hostname(s.url)}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ChatMessage({ message, streaming }) {
  if (message.role === "user") {
    return (
      <div className="msg msg-user">
        <div className="bubble">{message.content}</div>
      </div>
    );
  }

  const thinking = streaming && !message.content && !message.steps.some((s) => !s.done);

  return (
    <div className="msg msg-assistant">
      <div className="avatar">
        <LogoMark size={30} />
      </div>
      <div className="msg-body">
        {message.steps.map((step, i) => (
          <SearchStep key={i} step={step} />
        ))}

        {thinking && (
          <div className="typing" aria-label="Thinking">
            <span />
            <span />
            <span />
          </div>
        )}

        {message.content && (
          <div className={`markdown ${streaming ? "streaming" : ""}`}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {message.content}
            </ReactMarkdown>
          </div>
        )}

        {message.error && (
          <div className="error">
            <AlertIcon size={16} />
            <div>
              <strong>Something went wrong.</strong>
              <p>{message.error}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
