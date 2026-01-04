# Pug Template Testing Guide

This guide explains how to test frontend modules using real Pug templates instead of extensive DOM mocking.

## Problem with Mocked DOM

Previously, tests had to mock every DOM element:

```typescript
const mockElement = {
    addEventListener: jest.fn(),
    appendChild: jest.fn(),
    querySelector: jest.fn(),
    // ... 50+ more properties
};

mockGetElementById.mockReturnValue(mockElement);
```

**Issues:**
- Brittle: breaks when DOM structure changes
- Incomplete: hard to mock all properties correctly
- Unrealistic: doesn't test against actual page structure
- Maintenance burden: lots of boilerplate

## Solution: Render Real Pug Templates

Use the `renderPugView` helper to render actual Pug templates into the test DOM.

### Basic Usage

```typescript
import {renderPugView} from '../helpers/renderPugView';

// In your test
const html = renderPugView('activity/activity-create.pug', {
    data: {
        title: 'Test Plan',
        startDate: '2024-01-01',
        endDate: '2024-01-07'
    },
    perms: {
        permMeta: [],
        defaultPerms: {},
        presets: []
    }
});

document.body.innerHTML = html;

// Now test against real DOM
const form = document.getElementById('planForm');
expect(form).toBeTruthy();
```

### Parameters

**`renderPugView(viewPath, locals, extractContent)`**

- `viewPath`: Path relative to `src/views/` (e.g., `'activity/activity-create.pug'`)
- `locals`: Data to pass to template (merged with defaults)
- `extractContent`: If true, extracts only the `<main>` content (skips full layout)

### Default Locals

The helper provides these defaults (can be overridden):

```typescript
{
    permData: {
        entity: {
            has: () => false  // No permissions by default
        }
    },
    data: {},
    user: null
}
```

### Extracting Content Only

For focused testing without full page layout:

```typescript
const html = renderPugView('activity/activity-create.pug', locals, true);
// Returns only content block, not full HTML document
```

## Example: activity-create-with-pug.test.ts

See `tests/client/unit/activity-create-with-pug.test.ts` for a complete example.

### Before (Mocked DOM)

```typescript
// 100+ lines of mocking
const mockElement = { /* ... */ };
mockGetElementById.mockImplementation((id) => {
    if (id === 'planForm') return mockForm;
    if (id === 'startDate') return mockStartDate;
    // ... many more conditions
});
```

### After (Real Pug)

```typescript
// Render real template
const html = renderPugView('activity/activity-create.pug', {
    data: { /* minimal data */ }
});
document.body.innerHTML = html;

// Test immediately works with real structure
const form = document.getElementById('planForm');
```

## Benefits

1. **More Realistic**: Tests run against actual page HTML
2. **Less Code**: No extensive mocking boilerplate
3. **Catches Real Issues**: DOM structure bugs are found
4. **Self-Updating**: Template changes automatically reflected
5. **Easier Debugging**: Can inspect actual HTML in tests

## Migration Strategy

### Step 1: Create Pug-based test alongside old test
```
activity-create.test.ts          (existing with mocks)
activity-create-with-pug.test.ts (new with Pug rendering)
```

### Step 2: Gradually move tests to Pug version
- Start with simple tests (form structure, element existence)
- Move complex tests once approach is validated
- Keep old tests as reference

### Step 3: Eventually deprecate mocked tests
- Once Pug tests cover all scenarios
- Remove old mocked test files
- Update documentation

## Limitations

### Complex Mixins
Some Pug templates use complex mixins that are hard to test in isolation:

```pug
+entityPicker('event_id', events, {label: 'Event'})
+permMatrix(['participant', 'guest'], permMeta, defaults)
```

**Solution**: Provide mock data for mixins or use fallback DOM structure.

### Server-Side Data
Templates expect data from server:

```pug
each slot in data.slots
    // render slot
```

**Solution**: Pass mock data in `locals` parameter.

### Bootstrap Components
Templates use Bootstrap components that require JS:

```pug
.modal#myModal
    // modal structure
```

**Solution**: Mock Bootstrap globals in test setup:

```typescript
(global as any).window.bootstrap = {
    Modal: jest.fn(),
    Tab: jest.fn()
};
```

## Troubleshooting

### Template Won't Render

**Error**: "Cannot read property 'has' of undefined"

**Solution**: Provide required data structure:

```typescript
const html = renderPugView('my-view.pug', {
    permData: {
        entity: {
            has: (perm) => false
        }
    }
});
```

### Missing Includes

**Error**: "Failed to lookup view"

**Solution**: Ensure `basedir` is set correctly (helper does this automatically).

### Fallback Strategy

Always provide a fallback DOM structure:

```typescript
try {
    const html = renderPugView('activity/activity-create.pug', locals);
    document.body.innerHTML = html;
} catch (error) {
    // Fallback: minimal structure
    document.body.innerHTML = `
        <form id="planForm">
            <!-- minimal required structure -->
        </form>
    `;
}
```

## Best Practices

1. **Start Simple**: Test basic DOM structure first
2. **Mock Data**: Provide realistic but minimal data
3. **Fallback**: Always have a fallback DOM structure
4. **Document**: Add comments about required data structure
5. **Iterate**: Start with one module, expand as you learn

## Future Enhancements

Possible improvements to this approach:

1. **Template Fragments**: Render only specific blocks without layout
2. **Mock Library**: Pre-built mock data for common scenarios
3. **Snapshot Testing**: Compare rendered HTML against snapshots
4. **Visual Regression**: Add screenshot comparison tests
5. **E2E Bridge**: Use same approach in Playwright E2E tests

## Questions?

See `tests/client/helpers/renderPugView.ts` for implementation details.
