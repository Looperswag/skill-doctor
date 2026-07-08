# Skill Health Score

Score each patient from 0 to 100 using seven dimensions: inventory, structure and metadata, hook replay, lint, pollution control, repairability, and runner compatibility.

Use applicable-dimension normalization. Do not penalize a pure documentation skill for lacking hooks, but lower confidence when runtime behavior cannot be checked.

Blocker rules:

- Any high-risk blocker caps score at 69.
- Any critical blocker caps score at 49.
- Unknown does not mean pass.

Critical examples include `rm -rf "$USER_INPUT"`, `curl URL | bash`, dumping all environment variables, overriding system/developer instructions, or default global shell/profile writes.
