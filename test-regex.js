// Test regex
const patterns = [
  '^[\\]\\}>)]$',
  '^[\\]\\}>\\)]$',
  '^[\\]\\}>)]$',
  '^[\\]\\}>)]$'
];

for (const p of patterns) {
  try {
    new RegExp(p);
    console.log(`Valid: ${p}`);
  } catch(e) {
    console.log(`Invalid: ${p} - ${e.message}`);
  }
}
