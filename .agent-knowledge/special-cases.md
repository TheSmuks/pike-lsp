# Special Cases & Workarounds

Edge cases and how to handle them.

## CI Failures

### Model Not Found / Timeout Errors

**Symptom**: Background task fails with "Task timed out" or model unavailable

**Solution**:

1. Implement manually instead of retrying subagent
2. Create branch with `git checkout -b fix/issue-{number}`
3. Make changes directly
4. Commit with `--no-verify` if needed
5. Push and create PR manually

### CI Checks Hanging

**Symptom**: `gh pr checks` shows pending checks for long time

**Solution**:

```bash
# Force push empty commit to retrigger
sleep 60
git commit --amend --no-edit
git push --force-with-lease
```

### vscode-e2e Check Expected But Not Running

**Symptom**: PR blocked because "vscode-e2e" check is expected but not showing

**Solution**: Wait for dependent jobs to complete first. The aggregate job triggers after matrix jobs.

---

## Pre-commit Hook Issues

### Hook Timeout

**Symptom**: Pre-commit hook takes too long and fails

**Solution**: Use `--no-verify` flag:

```bash
git commit -m "message" --no-verify
```

### Hook Failed But Code Is Correct

**Symptom**: Hook fails due to environment issues, not code issues

**Solution**: Skip hook with `--no-verify` and let CI validate

---

## GitHub Issues

### Can't Create Issue - Title Too Long

**Symptom**: `gh issue create` fails with validation error

**Solution**: Use shorter title, add details in body

### Issue Already Exists

**Symptom**: Trying to create issue but similar one exists

**Solution**: Search first with `gh issue list --label safe --state open`

---

## Merge Conflicts

### Dirty Repo After Stash Pop

**Symptom**: After `git stash pop`, merge conflicts in files

**Solution**:

1. Check conflict markers: `grep -n "<<<<<<<" file.ts`
2. Resolve conflicts manually
3. `git add -A && git commit`

### Can't Pull Main - Local Changes

**Symptom**: `git pull origin main` fails due to local changes

**Solution**:

```bash
git stash
git pull origin main
git stash pop
# Resolve any conflicts
```

---

## Package.json

### Duplicate Settings

**Symptom**: CI fails with "Duplicate key" warning or strange behavior

**Check**:

```bash
grep -n "pike.settingName" packages/vscode-pike/package.json
```

**Solution**: Remove duplicates before committing

---

## TypeScript / Build

### Typecheck Passes But Build Fails

**Symptom**: `bun run typecheck` passes but `bun run build` fails

**Cause**: Often due to missing files or esbuild issues

**Solution**: Check that all imported files exist

### Module Not Found Error

**Symptom**: "Cannot find module './module-name'"

**Solution**:

1. Check if file exists: `ls src/module-name.ts`
2. If file should exist but doesn't, it was lost in merge/stash
3. Recreate the file
