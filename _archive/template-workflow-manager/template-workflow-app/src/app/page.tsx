'use client';

import { useState } from 'react';
import Link from 'next/link';
import { mockTemplates, workflowPresets } from '@/data/mockData';
import { Template } from '@/types';
import { FileText, Plus, Search, Sparkles, Upload, Clock, Edit, Send, MoreVertical, ChevronDown } from 'lucide-react';
import EditableText from '@/components/EditableText';

export default function Home() {
  const [templates] = useState<Template[]>(mockTemplates);
  const [searchQuery, setSearchQuery] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);

  const recentTemplates = templates.slice(0, 4);
  
  const filteredTemplates = searchQuery 
    ? templates.filter(template => 
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center space-x-3">
            <FileText className="h-8 w-8 text-primary-600" />
            <EditableText 
              contentKey="home.title" 
              defaultValue="Template Workflow Manager" 
              as="h1" 
              className="text-2xl font-bold text-gray-900" 
            />
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section - Create Template */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <EditableText 
              contentKey="home.hero.title" 
              defaultValue="Create Your Template" 
              as="h2" 
              className="text-4xl font-bold text-gray-900 mb-3" 
            />
            <EditableText 
              contentKey="home.hero.subtitle" 
              defaultValue="Generate document templates with AI assistance in FXDA format, complete with positioned form fields and optional workflow configurations" 
              as="p" 
              className="text-xl text-gray-600 max-w-3xl mx-auto" 
            />
          </div>

          {/* Creation Methods */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Link href="/templates/create?method=ai">
              <div className="bg-white border-2 border-gray-200 rounded-xl p-8 hover:border-primary-500 hover:shadow-xl transition-all cursor-pointer group h-full">
                <div className="bg-gray-100 w-16 h-16 rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary-100 transition-colors mx-auto">
                  <Sparkles className="h-8 w-8 text-gray-600 group-hover:text-primary-600" />
                </div>
                <EditableText 
                  contentKey="home.method.ai.title" 
                  defaultValue="Generate" 
                  as="h3" 
                  className="text-xl font-bold mb-3 text-center" 
                />
                <EditableText 
                  contentKey="home.method.ai.description" 
                  defaultValue="Describe your needs and generate content with AI" 
                  as="p" 
                  className="text-gray-600 text-center text-sm" 
                />
              </div>
            </Link>

            <Link href="/templates/create?method=paste">
              <div className="bg-white border-2 border-gray-200 rounded-xl p-8 hover:border-primary-500 hover:shadow-xl transition-all cursor-pointer group h-full">
                <div className="bg-gray-100 w-16 h-16 rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary-100 transition-colors mx-auto">
                  <FileText className="h-8 w-8 text-gray-600 group-hover:text-primary-600" />
                </div>
                <EditableText 
                  contentKey="home.method.paste.title" 
                  defaultValue="Paste Text" 
                  as="h3" 
                  className="text-xl font-bold mb-3 text-center" 
                />
                <EditableText 
                  contentKey="home.method.paste.description" 
                  defaultValue="Paste existing text content to use as template" 
                  as="p" 
                  className="text-gray-600 text-center text-sm" 
                />
              </div>
            </Link>

            <Link href="/templates/create?method=upload">
              <div className="bg-white border-2 border-gray-200 rounded-xl p-8 hover:border-primary-500 hover:shadow-xl transition-all cursor-pointer group h-full">
                <div className="bg-gray-100 w-16 h-16 rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary-100 transition-colors mx-auto">
                  <Upload className="h-8 w-8 text-gray-600 group-hover:text-primary-600" />
                </div>
                <EditableText 
                  contentKey="home.method.upload.title" 
                  defaultValue="Import File/URL" 
                  as="h3" 
                  className="text-xl font-bold mb-3 text-center" 
                />
                <EditableText 
                  contentKey="home.method.upload.description" 
                  defaultValue="Upload a file or import from a URL" 
                  as="p" 
                  className="text-gray-600 text-center text-sm" 
                />
              </div>
            </Link>
          </div>
        </div>

        {/* Search Bar */}
        <div className="mb-8 max-w-2xl mx-auto">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search existing templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent shadow-sm"
            />
          </div>
        </div>

        {/* Search Results or Recent Templates */}
        {searchQuery ? (
          <div>
            <h3 className="text-2xl font-bold text-gray-900 mb-6">
              Search Results ({filteredTemplates.length})
            </h3>
            {filteredTemplates.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredTemplates.map(template => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            ) : (
              <div className="text-center py-12 bg-white rounded-lg border">
                <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No templates found</h3>
                <p className="text-gray-500">Try a different search term</p>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Clock className="h-6 w-6 text-gray-600" />
                <h3 className="text-2xl font-bold text-gray-900">Recent Templates</h3>
              </div>
              <Link
                href="/templates"
                className="text-primary-600 hover:text-primary-700 font-medium text-sm"
              >
                View All →
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {recentTemplates.map(template => (
                <TemplateCard key={template.id} template={template} openMenuId={openMenuId} setOpenMenuId={setOpenMenuId} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function TemplateCard({ template, openMenuId, setOpenMenuId }: { template: Template; openMenuId: string | null; setOpenMenuId: (id: string | null) => void }) {
  const workflow = template.workflowPresetId 
    ? workflowPresets.find(w => w.id === template.workflowPresetId)
    : null;

  return (
    <div className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow border border-gray-200 h-full flex flex-col relative">
      {/* Thumbnail */}
      <div className="bg-gradient-to-br from-primary-50 to-primary-100 h-32 flex items-center justify-center relative overflow-hidden rounded-t-lg">
        {template.thumbnail && template.thumbnail.startsWith('http') ? (
          <img 
            src={template.thumbnail} 
            alt={template.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <span className="text-5xl">{template.thumbnail || '📄'}</span>
        )}
        {template.hasWorkflow && (
          <div className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 rounded-full text-xs font-medium">
            + Workflow
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5 flex-1 flex flex-col">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900 flex-1">{template.name}</h3>
          {template.validated && (
            <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
              ✓ Validated
            </span>
          )}
        </div>

        <p className="text-sm text-gray-600 mb-4 line-clamp-2">{template.description}</p>

        {/* Workflow Badges */}
        {workflow && (
          <div className="flex flex-wrap gap-2 mb-4">
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
              {workflow.parties} Parties
            </span>
            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
              {workflow.signingOrder}
            </span>
            {workflow.requiresApproval && (
              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                Approval Required
              </span>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span className="px-2 py-1 bg-gray-100 rounded">{template.category}</span>
            <span>Used {template.usageCount} times</span>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 relative">
            <button
              onClick={(e) => {
                e.preventDefault();
                setOpenMenuId(openMenuId === template.id ? null : template.id);
              }}
              className="flex-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-semibold flex items-center justify-center gap-1 transition-colors"
            >
              Open
              <ChevronDown className="h-3 w-3" />
            </button>
            
            {/* Overflow Menu */}
            {openMenuId === template.id && (
              <div className="absolute left-0 top-full mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setOpenMenuId(null);
                    alert(`Opening "${template.name}" in Foxit Editor...\n\nIn production: Opens template in Editor Cloud for content editing. Changes are saved as new version while workflow preset remains linked.`);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 first:rounded-t-lg"
                >
                  <Edit className="h-4 w-4 text-gray-500" />
                  Open in Editor
                </button>
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    setOpenMenuId(null);
                    alert(`Opening "${template.name}" in eSign${template.hasWorkflow ? ' with workflow' : ''}...\n\nIn production: Opens eSign ${template.hasWorkflow ? `with pre-configured "${workflow?.name}" workflow ready to send for signatures` : 'to create a new signing workflow'}.`);
                  }}
                  className="w-full px-4 py-2 text-left text-sm hover:bg-gray-50 flex items-center gap-2 last:rounded-b-lg"
                >
                  <Send className="h-4 w-4 text-gray-500" />
                  Open in eSign
                </button>
              </div>
            )}
            
            {!template.hasWorkflow && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  alert(`Add workflow to "${template.name}"?\n\nIn production: Opens workflow configuration to add signing workflow to this template.`);
                }}
                className="flex-1 px-3 py-2 border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors"
              >
                <Plus className="h-3 w-3" />
                Add Workflow
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
