# 🎯 Demo Guide - Template Workflow Manager

## Quick Demo Script

### 1. **Home Page - Template Library** (Main landing page)

**What to show:**
- Browse through 4 pre-loaded mock templates
- Point out the template cards showing:
  - Template name and description
  - Thumbnail emoji icons
  - Workflow badges (parties, signing order, approval status)
  - Category tags
  - Usage statistics
  - Validation status

**Features to demonstrate:**
- Search functionality - try searching for "NDA" or "Offer"
- Category filter dropdown - filter by Legal, HR, Procurement, General
- Hover effects on template cards

---

### 2. **Template Detail View** (Click any template)

**What to show:**
- Comprehensive template information display
- Three interactive tabs:
  1. **Overview Tab** - Document structure and AI generation notice
  2. **Workflow Tab** - Complete workflow preset details:
     - Workflow name and description
     - Number of parties
     - Signing order (sequential/parallel)
     - Security level
     - Reminder and expiration settings
     - Approval requirements
  3. **Fields Tab** - All form fields with:
     - Field names and types
     - Required/optional status
     - Party assignments

**Right Sidebar shows:**
- Template metadata (category, creator, dates, version)
- Tags
- Usage statistics
- Validation status

**Action buttons:**
- Edit - Edit template (not implemented in prototype)
- Duplicate - Clone template (not implemented in prototype)
- Use Template - Apply template to new document (not implemented in prototype)

---

### 3. **Create Template Flow** (Click "Create Template" button)

#### Step 1: Method Selection
**What to show:**
Three creation methods:
1. **AI-Assisted Generation** ⭐ (Primary demo feature)
2. **Upload Document** (UI only in prototype)
3. **Start from Scratch** (UI only in prototype)

#### Step 2: AI Template Description
**What to show:**
- Large text area for natural language description
- AI-powered generation button

**Demo Script:**
Type something like:
> "Create a standard NDA for vendors with 2 parties signing sequentially, including confidentiality clauses and a 1-year term"

Click "Generate with AI" and watch:
- Loading animation
- AI "generates" template in ~2 seconds

#### Step 3: Workflow Selection
**What to show:**
- AI Recommendation banner suggesting best workflow preset
- List of 4 available workflow presets:
  1. Standard NDA – 2 Parties – Sequential
  2. HR Offer Letter – Employee Signs First
  3. Vendor Contract – Parallel Signing + Approval
  4. Simple Agreement – 2 Parties – Parallel

**For each preset, show:**
- Name and description
- Visual badges for parties and signing order
- Security level, reminder frequency, expiration days

**Action:**
- Select a workflow preset (it highlights)
- Click "Create Template" button
- Success alert shows template creation

---

## Key Features to Highlight

### ✨ AI-Powered Intelligence
- Natural language template generation
- Automatic field recognition
- Smart workflow preset recommendations
- Reduces manual configuration time

### 🔄 Reusable Workflows
- Pre-configured workflow presets
- One-click application
- Predictable, repeatable behavior
- No need to reconfigure each time

### 📋 Template as First-Class Assets
- Templates include structure + workflow
- Complete metadata and versioning
- Validation status tracking
- Usage analytics

### 🎨 Modern UX
- Clean, intuitive interface
- Visual workflow badges
- Comprehensive search and filtering
- Responsive design

---

## Technical Highlights for Judges

### Architecture
- **Framework**: Next.js 14 with App Router
- **Language**: TypeScript for type safety
- **Styling**: Tailwind CSS for rapid development
- **Icons**: Lucide React
- **API**: RESTful endpoints for CRUD operations

### Code Quality
- Clean component structure
- Type-safe interfaces
- Reusable mock data
- Scalable architecture

### Features Implemented
✅ Template discovery and visualization
✅ Detailed template view with tabs
✅ AI-assisted template creation flow
✅ Workflow preset selection
✅ Mock API endpoints
✅ Search and filtering
✅ Responsive design

### Production Considerations
The prototype demonstrates:
- How templates become workflow-aware assets
- How AI reduces setup time
- How workflow presets improve consistency
- Clean separation of concerns for easy backend integration

---

## Common Questions & Answers

**Q: Does this actually use AI?**
A: The prototype simulates AI with smart parsing and response generation. In production, this would integrate with OpenAI, Claude, or a custom model.

**Q: Where is the data stored?**
A: Currently uses mock data in TypeScript files. Production would integrate with Foxit DMS for storage, versioning, and permissions.

**Q: Can you actually send documents?**
A: The "Use Template" button shows the intent but isn't fully implemented. Production would integrate with Foxit eSign for actual document workflow.

**Q: How does versioning work?**
A: Templates track version numbers. Production would leverage existing Foxit DMS versioning capabilities.

**Q: Is this mobile-friendly?**
A: Yes! Built with Tailwind CSS responsive utilities. Works on mobile, tablet, and desktop.

---

## URLs to Bookmark

- **Home/Library**: http://localhost:3000
- **Create Template**: http://localhost:3000/templates/create
- **Example Template**: http://localhost:3000/templates/tpl-001

---

## Next Steps for Production

1. **Backend Integration**
   - Connect to Foxit DMS for storage
   - Integrate real AI models
   - Add authentication

2. **Enhanced Features**
   - Real-time collaboration
   - Advanced analytics
   - Policy enforcement
   - Audit trails

3. **Foxit Integration**
   - Editor Cloud API for document authoring
   - eSign API for workflow execution
   - DMS API for storage and permissions

---

## Presentation Tips

1. **Start with the problem** - Show how current workflow setup is repetitive
2. **Demo the solution** - Walk through AI template creation
3. **Highlight time savings** - Compare old vs. new approach
4. **Show the architecture** - Quick code walkthrough if technical audience
5. **Discuss business value** - Faster adoption, fewer errors, better UX

---

## Quick Reset

To reset the demo:
1. Refresh the browser (mock data reloads)
2. Or restart the dev server: `npm run dev`

---

**Good luck with your demo! 🚀**
