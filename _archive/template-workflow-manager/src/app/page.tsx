'use client';

import { useState } from 'react';
import Link from 'next/link';
import { mockTemplates, workflowPresets } from '@/data/mockData';
import { Template } from '@/types';
import { FileText, Plus, Search, Sparkles, Upload, Clock, Edit, Send } from 'lucide-react';

export default function Home() {
  const [templates] = useState<Template[]>(mockTemplates);
  const [searchQuery, setSearchQuery] = useState('');

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
            <h1 className="text-2xl font-bold text-gray-900">Template Workflow Manager</h1>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Hero Section - Create Template */}
        <div className="mb-12">
          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold text-gray-900 mb-3">
              Create Your Template
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Generate document templates with AI assistance in FXDA format, complete with positioned form fields and optional workflow configurations
            </p>
          </div>

          {/* Creation Methods */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Link href="/templates/create?method=ai">
              <div className="bg-white border-2 border-primary-200 rounded-xl p-8 hover:border-primary-500 hover:shadow-xl transition-all cursor-pointer group h-full">
                <div className="bg-primary-100 w-16 h-16 rounded-xl flex items-center justify-center mb-6 group-hover:bg-primary-200 transition-colors mx-auto">
                  <Sparkles className="h-8 w-8 text-primary-600" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-center">AI-Assisted Generation</h3>
                <p className="text-gray-600 text-center text-sm">
                  Describe what you need and let AI generate a complete template with positioned fields
                </p>
              </div>
            </Link>

            <Link href="/templates/create?method=upload">
              <div className="bg-white border-2 border-gray-200 rounded-xl p-8 hover:border-gray-400 hover:shadow-xl transition-all cursor-pointer group h-full">
                <div className="bg-gray-100 w-16 h-16 rounded-xl flex items-center justify-center mb-6 group-hover:bg-gray-200 transition-colors mx-auto">
                  <Upload className="h-8 w-8 text-gray-600" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-center">Upload Document</h3>
                <p className="text-gray-600 text-center text-sm">
                  Upload an existing document and we&apos;ll recognize the fields automatically
                </p>
              </div>
            </Link>

            <Link href="/templates/create?method=scratch">
              <div className="bg-white border-2 border-gray-200 rounded-xl p-8 hover:border-gray-400 hover:shadow-xl transition-all cursor-pointer group h-full">
                <div className="bg-gray-100 w-16 h-16 rounded-xl flex items-center justify-center mb-6 group-hover:bg-gray-200 transition-colors mx-auto">
                  <FileText className="h-8 w-8 text-gray-600" />
                </div>
                <h3 className="text-xl font-bold mb-3 text-center">Start from Scratch</h3>
                <p className="text-gray-600 text-center text-sm">
                  Manually create your template with complete control over every detail
                </p>
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
                <TemplateCard key={template.id} template={template} />
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function TemplateCard({ template }: { template: Template }) {
  const workflow = template.workflowPresetId 
    ? workflowPresets.find(w => w.id === template.workflowPresetId)
    : null;

  return (
    <div className="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow border border-gray-200 overflow-hidden h-full flex flex-col">
      {/* Thumbnail */}
      <div className="bg-gradient-to-br from-primary-50 to-primary-100 h-32 flex items-center justify-center text-5xl relative">
        {template.thumbnail || '📄'}
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
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.preventDefault();
                alert(`Opening "${template.name}" in Foxit Editor...\n\nIn production: Opens template in Editor Cloud for content editing. Changes are saved as new version while workflow preset remains linked.`);
              }}
              className="flex-1 px-3 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors"
            >
              <Edit className="h-3 w-3" />
              Open in Editor
            </button>
            
            {template.hasWorkflow && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  alert(`Opening "${template.name}" in eSign with workflow...\n\nIn production: Opens eSign with pre-configured "${workflow?.name}" workflow ready to send for signatures.`);
                }}
                className="flex-1 px-3 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors"
              >
                <Send className="h-3 w-3" />
                Open in eSign
              </button>
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
