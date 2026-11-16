import { createCn } from "cn/config";

// The type scale in app/globals.css: register it as font sizes so cn() never drops one as a "text color".
export const cn = createCn({
  extend: { classGroups: { "font-size": [{ text: ["display", "title", "heading", "card-title", "body", "meta", "micro"] }] } },
});
