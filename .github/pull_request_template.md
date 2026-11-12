## Description

Briefly describe the change, the problem it solves, and the motivation behind it.

## Type of Change

- [ ] 🐛 Bug fix (non-breaking change fixing an issue)
- [ ] ✨ New feature (non-breaking change adding functionality)
- [ ] 📝 Documentation update
- [ ] 🔧 Refactoring or code quality improvement
- [ ] ⚡ Performance optimization
- [ ] 🗄️ Database migration
- [ ] 💵 Pricing catalog fixture update

## Related Issues

Fixes #(issue number)

## Key Changes

- Item 1
- Item 2
- Item 3

## Verification & Testing Performed

Describe how you tested these changes:
- [ ] Unit tests added / updated (`npm test`)
- [ ] Integration tests executed (`npm run test:integration`)
- [ ] TypeScript typecheck passed (`npm run typecheck`)
- [ ] Linter passed (`npm run lint`)
- [ ] Manual verification in browser (`npm run dev`)

### Screenshots / Output (if applicable)
```
Paste test outputs or embed screenshots here
```

## Checklist

- [ ] My code adheres to the project's coding standards and style guidelines.
- [ ] I have avoided floating-point arithmetic for currency calculations (`big.js` is used).
- [ ] I have not committed secrets, real API keys, or production database credentials.
- [ ] Any necessary schema changes are included as new forward migrations in `supabase/migrations/`.
- [ ] Documentation has been updated to reflect new features or configuration requirements.
