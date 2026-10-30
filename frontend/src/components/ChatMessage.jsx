import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AlertIcon, CheckIcon, FileIcon, LinkIcon, LogoMark, SearchIcon } from "./Icons.jsx";

// Open links from the model in a new tab.
// Images from the model are shown as links, never loaded on their own: an image
// address can carry chat text to any site (for example via a prompt injection in
// a web page or file). To show trusted images later (our own /api/images/...,
// charts drawn from data), return an <img> here for those cases only.
const markdownComponents = {
  a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
  img: ({ node, src, alt }) =>
    src ? (
      <a href={src} target="_blank" rel="noopener noreferrer nofollow">
        {alt || "Image"}
      </a>
    ) : (
      alt || null
    ),
};

function hostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

// A web page the agent read: a link with the site's icon.
function WebSource({ source }) {
  return (
    <a className="source" href={source.url} target="_blank" rel="noopener noreferrer" title={source.title}>
      <img src={`https://www.google.com/s2/favicons?domain=${hostname(source.url)}&sz=32`} alt="" onError={(e) => (e.currentTarget.style.display = "none")} />
      <span>{hostname(source.url)}</span>
    </a>
  );
}

// A passage from an uploaded file: the file name and page. Files that came from a link open it.
function FileSource({ source }) {
  const inner = (
    <>
      {source.url ? <LinkIcon size={13} /> : <FileIcon size={13} />}
      <span>{source.filename}</span>
      {source.page && <em>p. {source.page}</em>}
    </>
  );
  return source.url ? (
    <a className="source file" href={source.url} target="_blank" rel="noopener noreferrer" title={source.title}>
      {inner}
    </a>
  ) : (
    <span className="source file" title={source.title}>
      {inner}
    </span>
  );
}

// One search the agent ran (web or uploaded files), with the sources it found.
// Older saved chats have no `tool` field; those were all web searches.
function SearchStep({ step }) {
  const inFiles = step.tool === "search_documents";
  const where = inFiles ? "your files" : "the web";
  if (step.error) {
    return (
      <div className="step failed">
        <div className="step-head">
          <AlertIcon size={14} />
          <span>
            Couldn't search {where} for <strong>“{step.query}”</strong>
          </span>
        </div>
        <p className="step-error">{step.error}</p>
      </div>
    );
  }
  return (
    <div className={`step ${step.done ? "done" : "running"}`}>
      <div className="step-head">
        {step.done ? <CheckIcon size={14} /> : <SearchIcon size={14} className="spin-pulse" />}
        <span>
          {step.done ? `Searched ${where} for` : `Searching ${where} for`} <strong>“{step.query}”</strong>
        </span>
      </div>
      {step.sources.length > 0 && (
        <div className="sources">
          {step.sources.map((s) =>
            inFiles ? <FileSource key={s.title} source={s} /> : <WebSource key={s.url} source={s} />,
          )}
        </div>
      )}
      {step.done && inFiles && step.sources.length === 0 && <p className="step-empty">No matching passages.</p>}
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
