# Inline Editing Features

## Two Editing Modes

### 1. 🎨 **End-User Content Editing** (Preview Step)
Allows users creating templates to edit AI-generated content before saving.

**Location:** `/templates/create?method=ai` → After AI generation in Preview step

**What Users Can Edit:**
- ✏️ **Template Name & Description** - Edit metadata at the top
- 📄 **Document Content** - Click "Edit Content" to modify the text
- 🔲 **Form Fields** - Click any field to edit:
  - Field name and type
  - Position (x, y) and size (width, height)
  - Required status
  - Delete unwanted fields

**How to Use:**
1. Generate a template with AI
2. In the Preview step, you'll see editable sections
3. Click on any field to edit it inline
4. Click "Edit Content" to modify the document text
5. All changes update in real-time
6. Click Continue when done

---

### 2. 🛠️ **Developer Mode** (UI Text Editing)
Allows developers to edit UI text across the app without touching source code.

**How to Enable:**
- Click the **"Dev Mode" button** (bottom right corner)
- Or it will automatically appear on all pages

**What You Can Edit:**
- 🏠 Page titles and headings
- 📝 Button labels and descriptions
- 💬 Placeholder text
- All UI text marked with EditableText component

**How to Use:**
1. Click the "Dev Mode: OFF" button → It turns blue "Dev Mode: ON"
2. All editable text gets a blue hover highlight with ✏️ icon
3. Click any highlighted text to edit it
4. Type your changes and press Enter or click ✓
5. Changes save to `src/data/contentDictionary.json` automatically
6. Changes persist across page refreshes and dev server restarts

**Example:**
- Turn on Dev Mode
- Click "Create Your Template" heading
- Change to "Build Your Template"
- Press Enter
- The JSON file updates and the change is live!

---

## Implementation Details

### End-User Editing
- **Component:** `EditablePreview.tsx`
- **Updates:** FXDA template object in memory
- **Persistence:** Only during session (no database)
- **Location:** Create template flow, preview step

### Developer Mode
- **Components:** `EditableText.tsx`, `EditableContext.tsx`
- **Updates:** `contentDictionary.json` file via API
- **Persistence:** Saves to filesystem (permanent)
- **API:** `POST /api/content` writes changes to file
- **Location:** Available on all pages when Dev Mode is ON

---

## Technical Architecture

```
┌─────────────────────────────────────────┐
│  End-User Editing (Preview Step)       │
│  - Edit template content & fields      │
│  - Updates FXDATemplate object          │
│  - No file system changes               │
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Developer Mode (Global)                │
│  - Edit UI text across app              │
│  - Updates contentDictionary.json       │
│  - Writes to file system via API        │
│  - Persists across restarts             │
└─────────────────────────────────────────┘
```

### Files Created/Modified:
- ✨ `src/contexts/EditableContext.tsx` - Global state for dev mode
- ✨ `src/components/EditableText.tsx` - Inline editable text component
- ✨ `src/components/EditablePreview.tsx` - Template content editor
- ✨ `src/data/contentDictionary.json` - UI text storage
- ✨ `src/app/api/content/route.ts` - API to save content changes
- 📝 `src/app/layout.tsx` - Added EditableProvider
- 📝 `src/app/layout-client.tsx` - Dev mode toggle button
- 📝 `src/app/page.tsx` - Wrapped text in EditableText
- 📝 `src/app/templates/create/page.tsx` - Added EditablePreview

---

## Demo Instructions

### Demo #1: End-User Editing
1. Go to http://localhost:3000
2. Click "AI-Assisted Generation"
3. Type: "Create a simple NDA"
4. Click "Generate with AI"
5. Wait for preview to load
6. **Edit template name** at the top
7. **Click "Edit Content"** to modify document text
8. **Click any form field** to edit its properties
9. Try changing a field name or position
10. Click Continue → Changes carry forward

### Demo #2: Developer Mode
1. Go to http://localhost:3000
2. **Click "Dev Mode: OFF"** button (bottom right)
3. Button turns blue "Dev Mode: ON"
4. **Hover over page title** - it highlights in blue
5. **Click "Template Workflow Manager"** heading
6. Type something new, press Enter
7. Check `src/data/contentDictionary.json` - it's updated!
8. Refresh page → Change persists
9. Try editing other text like button labels

---

## Tips

### For End Users:
- Make all content edits in the Preview step before continuing
- Changes only affect the current template being created
- Download JSON to save your work externally

### For Developers:
- Dev Mode is intentionally obvious (big button, blue highlights)
- All edits save immediately to file system
- Use git to track content dictionary changes
- Add new EditableText components anywhere:
  ```tsx
  <EditableText 
    contentKey="page.section.element"
    defaultValue="Original Text"
    as="h1"
    className="your-classes"
  />
  ```

---

## Limitations

### End-User Editing:
- ⚠️ No persistence (lost on page reload)
- ⚠️ No undo/redo yet
- ⚠️ Field validation is basic

### Developer Mode:
- ⚠️ Only edits plain text (not dynamic/conditional content)
- ⚠️ Requires wrapping text in EditableText component
- ⚠️ Can't edit non-text elements (icons, images, etc.)

---

## Future Enhancements

- [ ] Add undo/redo for both modes
- [ ] Real database persistence for end-user templates
- [ ] Visual field positioning (drag & drop)
- [ ] Multi-language support in content dictionary
- [ ] Batch edit operations
- [ ] Content versioning
