# Patches

Documentation for Lucid IDE patches applied on top of VS Code.

---

## fix-policies

**Replace `@vscode/policy-watcher` with `@Lucid IDE/policy-watcher`**

VS Code uses `@vscode/policy-watcher` to enforce Group Policy Objects (GPOs) on
Windows. That package reads from:

```
HKLM\SOFTWARE\Policies\Microsoft\<productName>
```

Lucid IDE forks this into `@Lucid IDE/policy-watcher`, which takes a separate
`vendorName` argument. The `createWatcher()` call becomes:

```ts
createWatcher('Lucid IDE', this.productName, ...)
```

Because Lucid IDE sets `product.nameLong = 'Lucid IDE'` (via `prepare_vscode.sh`),
`this.productName` resolves to `'Lucid IDE'` at runtime. Therefore, the final
Windows registry key that Lucid IDE reads policies from is:

```
HKLM\SOFTWARE\Policies\Lucid IDE\Lucid IDE\<PolicyName>
```

(or `HKCU\SOFTWARE\Policies\Lucid IDE\Lucid IDE\<PolicyName>` for per-user policies)

This differs from VS Code's path (`Microsoft\VSCode`) and is the root cause of
[issue #2714](https://github.com/yigit-guven/Lucid-IDE/issues/2714) where users mirror
VS Code's registry structure and find their GPOs ignored. Enterprise admins must
use the Lucid IDE-specific registry path.

### References

- [Lucid IDE issue #2714](https://github.com/yigit-guven/Lucid-IDE/issues/2714)
- [Lucid IDE/policy-watcher — RegistryPolicy.hh](https://github.com/Lucid IDE/policy-watcher/blob/main/src/windows/RegistryPolicy.hh)

