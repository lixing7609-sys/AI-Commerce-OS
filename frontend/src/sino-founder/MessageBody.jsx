import { Fragment } from "react";

function InlineText({ text }) {
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => part.startsWith("**") && part.endsWith("**")
    ? <strong key={index}>{part.slice(2, -2)}</strong>
    : <Fragment key={index}>{part}</Fragment>);
}

function TextLines({ lines }) {
  return lines.map((line, index) => <Fragment key={index}>{index ? <br /> : null}<InlineText text={line} /></Fragment>);
}

export function MessageBody({ children }) {
  const lines = String(children ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let paragraph = [];
  let list = null;

  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: "paragraph", lines: paragraph });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push(list);
    list = null;
  };

  lines.forEach((line) => {
    const heading = line.match(/^\s*(#{1,3})\s+(.+?)\s*$/);
    const ordered = line.match(/^\s*(\d+)[.)、]\s+(.+?)\s*$/);
    const unordered = line.match(/^\s*[-+*]\s+(.+?)\s*$/);
    if (!line.trim()) {
      flushParagraph();
      flushList();
    } else if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: `h${heading[1].length}`, text: heading[2] });
    } else if (ordered || unordered) {
      flushParagraph();
      const type = ordered ? "ol" : "ul";
      if (list?.type !== type) flushList();
      if (!list) list = { type, items: [] };
      list.items.push(ordered ? ordered[2] : unordered[1]);
    } else if (list && /^\s+/.test(line)) {
      list.items[list.items.length - 1] += `\n${line.trim()}`;
    } else {
      flushList();
      paragraph.push(line);
    }
  });
  flushParagraph();
  flushList();

  return <div className="sino-message-body">{blocks.map((block, index) => {
    if (block.type === "paragraph") return <p key={index}><TextLines lines={block.lines} /></p>;
    if (block.type === "ol" || block.type === "ul") {
      const List = block.type;
      return <List key={index}>{block.items.map((item, itemIndex) => <li key={itemIndex}><TextLines lines={item.split("\n")} /></li>)}</List>;
    }
    const Heading = block.type;
    return <Heading key={index}><InlineText text={block.text} /></Heading>;
  })}</div>;
}
