# Template Workflow Manager

AI-Powered Template Creation with Reusable Workflows - A prototype for Foxit

## Overview

This prototype demonstrates a modern approach to document template management that treats templates as reusable, workflow-aware assets. Built for a hackathon, it showcases how AI can streamline template creation while maintaining predictable, repeatable workflow behavior.

## Key Features

### 1. **Template Discovery & Visualization**
- Browse templates with rich preview cards
- View workflow badges (parties, signing order, approval requirements)
- Filter by category and search by name/description
- See usage statistics and validation status

### 2. **AI-Assisted Template Creation**
- Describe your template in natural language
- AI automatically generates document structure
- AI recognizes and suggests form fields
- AI recommends compatible workflow presets

### 3. **Workflow Presets**
Reusable workflow configurations including:
- **Standard NDA** – 2 Parties, Sequential
- **HR Offer Letter** – Employee Signs First
- **Vendor Contract** – Parallel Signing + Approval
- **Simple Agreement** – 2 Parties, Parallel

Each preset includes:
- Number of parties
- Signing order (sequential/parallel)
- Approval requirements
- Security level
- Reminder and expiration settings

### 4. **Template Detail View**
- Complete template information
- Interactive tabs (Overview, Workflow, Fields)
- Metadata and versioning info
- Usage statistics
- Validation status

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **State Management**: React Hooks

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Navigate to the project directory:
   ```bash
   cd template-workflow-app
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Project Structure

```
template-workflow-app/
├── src/
│   ├── app/
│   │   ├── api/                    # API routes
│   │   │   ├── templates/          # Template CRUD endpoints
│   │   │   ├── workflows/          # Workflow presets endpoint
│   │   │   └── ai/generate/        # AI generation endpoint
│   │   ├── templates/
│   │   │   ├── [id]/               # Template detail page
│   │   │   └── create/             # Template creation flow
│   │   ├── layout.tsx              # Root layout
│   │   ├── page.tsx                # Home/template library
│   │   └── globals.css             # Global styles
│   ├── types/
│   │   └── index.ts                # TypeScript type definitions
│   └── data/
│       └── mockData.ts             # Mock templates and workflows
├── public/                          # Static assets
├── package.json
├── tsconfig.json
├── tailwind.config.js
└── next.config.js
```

## Key Concepts

### Templates as First-Class Assets

Templates are no longer just documents—they're complete workflow-aware assets that include:
- Document structure
- Recognized form fields
- Attached workflow configuration
- Policy metadata
- Version history

### Workflow Presets

Instead of configuring workflows from scratch every time, users can:
1. Select a workflow preset
2. Apply it with one action
3. Review and adjust if needed

This "feature-application" model is faster and less error-prone than traditional configuration wizards.

### AI Assistance

The prototype demonstrates Phase 1 AI capabilities:
- AI-assisted template generation from natural language
- Automatic field recognition
- Compatible workflow preset suggestions

## Future Enhancements (Phase 2)

- Industry-specific workflow recommendations
- Incompatible workflow element detection
- Security and signing order optimization
- Integration with actual Foxit Editor and eSign APIs
- Real DMS integration for storage and versioning
- Multi-user collaboration features
- Advanced analytics and reporting

## API Endpoints

- `GET /api/templates` - List all templates
- `POST /api/templates` - Create new template
- `GET /api/templates/[id]` - Get template details
- `PUT /api/templates/[id]` - Update template
- `DELETE /api/templates/[id]` - Delete template
- `GET /api/workflows` - List workflow presets
- `POST /api/ai/generate` - Generate template with AI

## Design Decisions

1. **Next.js App Router**: Modern routing with server components support
2. **TypeScript**: Type safety for better development experience
3. **Tailwind CSS**: Rapid UI development with utility classes
4. **Mock Data**: Demonstrates functionality without backend dependencies
5. **Client Components**: Interactive features with React hooks

## Contributing

This is a hackathon prototype. For production use, consider:
- Implementing a real backend with database
- Adding authentication and authorization
- Integrating with Foxit Editor and eSign APIs
- Adding comprehensive error handling
- Implementing real-time collaboration
- Adding automated testing

## License

Prototype for Foxit Hackathon

## Contact

For questions about this prototype, please contact the development team.
