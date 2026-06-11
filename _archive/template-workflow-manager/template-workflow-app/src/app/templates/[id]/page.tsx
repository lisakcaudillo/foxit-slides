'use client';

import { useState, use } from 'react';
import Link from 'next/link';
import { mockTemplates, workflowPresets } from '@/data/mockData';
import { ArrowLeft, Download, Copy, Edit, FileText, Clock, User, Tag } from 'lucide-react';

export default function TemplateDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const template = mockTemplates.find(t => t.id === id);
  const [activeTab, setActiveTab] = useState<'overview' | 'workflow' | 'fields'>('overview');

  // Get workflow preset if template has one
  const workflowPreset = template?.workflowPresetId 
    ? workflowPresets.find(w => w.id === template.workflowPresetId)
    : undefined;

  if (!template) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Template not found</h2>
          <Link href="/" className="text-primary-600 hover:text-primary-700">
            Return to templates
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <Link
            href="/"
            className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Templates
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-4xl">{template.thumbnail}</span>
                <div>
                  <h1 className="text-3xl font-bold text-gray-900">{template.name}</h1>
                  <p className="text-gray-600 mt-1">{template.description}</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </button>
              <button className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors">
                <Copy className="h-4 w-4 mr-2" />
                Duplicate
              </button>
              <button className="inline-flex items-center px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors">
                <FileText className="h-4 w-4 mr-2" />
                Use Template
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Details */}
          <div className="lg:col-span-2 space-y-6">
            {/* Tabs */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="border-b border-gray-200">
                <nav className="flex -mb-px">
                  <button
                    onClick={() => setActiveTab('overview')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 ${
                      activeTab === 'overview'
                        ? 'border-primary-600 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Overview
                  </button>
                  <button
                    onClick={() => setActiveTab('workflow')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 ${
                      activeTab === 'workflow'
                        ? 'border-primary-600 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Workflow
                  </button>
                  <button
                    onClick={() => setActiveTab('fields')}
                    className={`px-6 py-3 text-sm font-medium border-b-2 ${
                      activeTab === 'fields'
                        ? 'border-primary-600 text-primary-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    Fields
                  </button>
                </nav>
              </div>

              <div className="p-6">
                {activeTab === 'overview' && (
                  <div className="space-y-4">
                    <div>
                      <h3 className="text-lg font-semibold mb-2">Document Structure</h3>
                      <p className="text-gray-600">{template.documentStructure}</p>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-semibold text-blue-900 mb-2">AI-Generated Template</h4>
                      <p className="text-sm text-blue-800">
                        This template was created with AI assistance. All form fields have been
                        automatically recognized and the suggested workflow preset has been applied.
                      </p>
                    </div>
                  </div>
                )}

                {activeTab === 'workflow' && workflowPreset && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="border border-gray-200 rounded-lg p-4">
                        <div className="text-sm text-gray-500 mb-1">Workflow Preset</div>
                        <div className="font-semibold">{workflowPreset.name}</div>
                      </div>
                      <div className="border border-gray-200 rounded-lg p-4">
                        <div className="text-sm text-gray-500 mb-1">Number of Parties</div>
                        <div className="font-semibold">{workflowPreset.parties}</div>
                      </div>
                      <div className="border border-gray-200 rounded-lg p-4">
                        <div className="text-sm text-gray-500 mb-1">Signing Order</div>
                        <div className="font-semibold capitalize">{workflowPreset.signingOrder}</div>
                      </div>
                      <div className="border border-gray-200 rounded-lg p-4">
                        <div className="text-sm text-gray-500 mb-1">Security Level</div>
                        <div className="font-semibold capitalize">{workflowPreset.securityLevel}</div>
                      </div>
                      <div className="border border-gray-200 rounded-lg p-4">
                        <div className="text-sm text-gray-500 mb-1">Reminder Frequency</div>
                        <div className="font-semibold">Every {workflowPreset.reminderDays} days</div>
                      </div>
                      <div className="border border-gray-200 rounded-lg p-4">
                        <div className="text-sm text-gray-500 mb-1">Expiration</div>
                        <div className="font-semibold">{workflowPreset.expirationDays} days</div>
                      </div>
                    </div>
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <p className="text-sm text-gray-600">{workflowPreset.description}</p>
                    </div>
                    {workflowPreset.requiresApproval && (
                      <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                        <div className="font-semibold text-orange-900 mb-1">⚠️ Approval Required</div>
                        <p className="text-sm text-orange-800">
                          This workflow requires approval before finalization
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'fields' && (
                  <div className="space-y-3">
                    {template.fields.map(field => (
                      <div key={field.id} className="border border-gray-200 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="font-semibold">{field.name}</div>
                          <div className="flex gap-2">
                            <span className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
                              {field.type}
                            </span>
                            {field.required && (
                              <span className="px-2 py-1 bg-red-100 text-red-700 text-xs rounded">
                                Required
                              </span>
                            )}
                            {field.party && (
                              <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs rounded">
                                Party {field.party}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column - Metadata */}
          <div className="space-y-6">
            {/* Metadata Card */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold mb-4">Template Information</h3>
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Tag className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <div className="text-sm text-gray-500">Category</div>
                    <div className="font-medium">{template.category}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <User className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <div className="text-sm text-gray-500">Created By</div>
                    <div className="font-medium">{template.createdBy}</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <div className="text-sm text-gray-500">Last Updated</div>
                    <div className="font-medium">
                      {new Date(template.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <FileText className="h-5 w-5 text-gray-400 mt-0.5" />
                  <div>
                    <div className="text-sm text-gray-500">Version</div>
                    <div className="font-medium">v{template.version}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Tags */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold mb-4">Tags</h3>
              <div className="flex flex-wrap gap-2">
                {template.tags.map(tag => (
                  <span
                    key={tag}
                    className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full"
                  >
                    #{tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Usage Stats */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h3 className="text-lg font-semibold mb-4">Usage Statistics</h3>
              <div className="text-center">
                <div className="text-4xl font-bold text-primary-600 mb-2">
                  {template.usageCount}
                </div>
                <div className="text-sm text-gray-500">times used</div>
              </div>
            </div>

            {/* Validation Status */}
            <div className={`rounded-lg border p-6 ${
              template.validated
                ? 'bg-green-50 border-green-200'
                : 'bg-yellow-50 border-yellow-200'
            }`}>
              <h3 className="text-lg font-semibold mb-2">
                {template.validated ? '✓ Validated' : '⚠️ Pending Validation'}
              </h3>
              <p className="text-sm">
                {template.validated
                  ? 'This template has been validated and is ready for use.'
                  : 'This template is pending validation and review.'}
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
