import ReactMarkdown from "react-markdown";

export function MessageBody({ children }) {
  return <div className="sino-message-body"><ReactMarkdown
    allowedElements={["p", "strong", "em", "ul", "ol", "li", "code", "h1", "h2", "h3", "h4", "h5", "h6", "br"]}
    unwrapDisallowed
  >{String(children ?? "")}</ReactMarkdown></div>;
}
