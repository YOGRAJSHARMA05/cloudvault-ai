"use client";

import { useEffect, useState } from "react";

export function usePreviewText(url: string) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error("Failed to load");
        return response.text();
      })
      .then((data) => {
        if (!cancelled) {
          setText(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError("This file could not be loaded.");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return { text, loading, error };
}
