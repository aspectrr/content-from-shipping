"use client";
import { useMemo } from "react";
import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: false,
});

/** Renders markdown to HTML via marked. Content is the user's own drafts/edits. */
export default function Markdown({ children }: { children: string }) {
  const html = useMemo(() => marked.parse(children ?? "") as string, [children]);
  return <div className="markdown-preview" dangerouslySetInnerHTML={{ __html: html }} />;
}
