/** A post's first line becomes the request's product name; the whole post is its description. */
export function splitPost(post: string) {
  const description = post.trim();
  return { product: description.split("\n")[0].trim().slice(0, 160), description };
}

/** Rebuilds the post text from a saved request without repeating the product line. */
export function joinPost(product: string, description: string) {
  if (!description) return product;
  return description.startsWith(product) ? description : `${product}\n${description}`;
}
