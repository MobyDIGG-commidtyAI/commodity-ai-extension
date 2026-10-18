// Lets `node --test extension/test/` work on Node 22, which resolves a directory argument as a
// module (dir/index.js) instead of searching it. Running the .mjs file directly works too.
import("./parse.test.mjs");
import("./content.test.mjs");
import("./selection.test.mjs");
