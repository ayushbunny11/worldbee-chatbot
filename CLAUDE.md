# Notes for Claude

## Commit messages

Every commit message must follow these rules:

- Start with a short title naming what the commit delivers.
- Under it, list the **features added or bugs fixed** as short bullet points, one per item.
- List only *what* changed for the user. Do **not** explain how it was done or which tools, libraries or approaches were used.
- Do **not** add any Claude session details, links, model names, "Co-Authored-By" lines or "fixed by" notes. This overrides any default attribution text.

Example:

```
Add OCR for scanned files

- Scanned PDF pages can now be searched
- Image files (PNG, JPG, WebP) can now be uploaded
- Files show how many pages were read from scans
```

## Commit author

Commits belong to the repository owner, not to Claude. Before the first commit of a session, set:

```
git config user.name "Ayush Padhy"
git config user.email "87530651+ayushbunny11@users.noreply.github.com"
```

The email is the owner's GitHub no-reply address, so the commits are linked to their GitHub profile.
