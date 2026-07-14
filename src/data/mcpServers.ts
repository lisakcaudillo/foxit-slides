import type { MCPServer } from '@/types/mcp';

export const defaultMCPServers: MCPServer[] = [
  {
    id: 'foxit',
    name: 'Foxit',
    description: 'PDF services, electronic signatures, and document processing',
    category: 'Foxit',
    endpointUrl: 'https://na1.fusion.foxit.com/api',
    transport: 'streamable-http',
    status: 'connected',
    isBuiltIn: true,
    authType: 'api-key',
    tools: [
      {
        name: 'convert_pdf_to_file',
        description: 'Export PDF to Word, Excel, HTML, image, or text',
        inputSchema: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'PDF file reference or URL' },
            outputFormat: {
              type: 'string',
              enum: ['docx', 'xlsx', 'html', 'png', 'txt'],
              description: 'Target output format',
            },
          },
          required: ['file', 'outputFormat'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            outputFile: { type: 'string', description: 'Converted file reference' },
          },
        },
        serverName: 'Foxit',
      },
      {
        name: 'convert_file_to_pdf',
        description: 'Convert a non-PDF file into PDF format',
        inputSchema: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'Source file reference or URL' },
          },
          required: ['file'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            outputFile: { type: 'string', description: 'PDF file reference' },
          },
        },
        serverName: 'Foxit',
      },
      {
        name: 'combine_pdfs',
        description: 'Merge multiple PDF documents into one',
        inputSchema: {
          type: 'object',
          properties: {
            files: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of PDF file references to combine',
            },
          },
          required: ['files'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            outputFile: { type: 'string', description: 'Combined PDF file reference' },
          },
        },
        serverName: 'Foxit',
      },
      {
        name: 'compare_pdfs',
        description: 'Programmatic comparison of two PDF documents',
        inputSchema: {
          type: 'object',
          properties: {
            fileA: { type: 'string', description: 'First PDF file reference' },
            fileB: { type: 'string', description: 'Second PDF file reference' },
          },
          required: ['fileA', 'fileB'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            diffReport: { type: 'string', description: 'Comparison result reference' },
          },
        },
        serverName: 'Foxit',
      },
      {
        name: 'compress_pdf',
        description: 'Reduce PDF file size for emailing or archiving',
        inputSchema: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'PDF file reference or URL' },
            quality: {
              type: 'string',
              enum: ['low', 'medium', 'high'],
              description: 'Compression quality level',
            },
          },
          required: ['file'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            outputFile: { type: 'string', description: 'Compressed PDF file reference' },
          },
        },
        serverName: 'Foxit',
      },
      {
        name: 'extract_pdf',
        description: 'Pull text or images from a PDF as a pipeline step',
        inputSchema: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'PDF file reference or URL' },
            extractType: {
              type: 'string',
              enum: ['text', 'images', 'both'],
              description: 'What to extract from the PDF',
            },
          },
          required: ['file'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            content: { type: 'string', description: 'Extracted content' },
          },
        },
        serverName: 'Foxit',
      },
      {
        name: 'flatten_pdf',
        description: 'Remove interactive elements from PDF before archiving',
        inputSchema: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'PDF file reference or URL' },
          },
          required: ['file'],
        },
        outputSchema: {
          type: 'object',
          properties: {
            outputFile: { type: 'string', description: 'Flattened PDF file reference' },
          },
        },
        serverName: 'Foxit',
      },
      {
        name: 'send_envelope',
        description: 'Send a document for electronic signature',
        inputSchema: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'PDF file reference to sign' },
            recipients: {
              type: 'array',
              items: { type: 'string' },
              description: 'List of signer email addresses',
            },
            subject: { type: 'string', description: 'Envelope subject line' },
          },
          required: ['file', 'recipients'],
        },
        serverName: 'Foxit',
      },
      {
        name: 'check_envelope_status',
        description: 'Check the signing status of an envelope',
        inputSchema: {
          type: 'object',
          properties: {
            envelopeId: { type: 'string', description: 'Envelope ID to check' },
          },
          required: ['envelopeId'],
        },
        serverName: 'Foxit',
      },
      {
        name: 'download_signed',
        description: 'Download the signed copy of a completed envelope',
        inputSchema: {
          type: 'object',
          properties: {
            envelopeId: { type: 'string', description: 'Envelope ID' },
          },
          required: ['envelopeId'],
        },
        serverName: 'Foxit',
      },
      {
        name: 'ai_summarize',
        description: 'Generate a concise summary of a document',
        inputSchema: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] },
        serverName: 'Foxit',
        isAI: true,
      },
      {
        name: 'ai_rewrite',
        description: 'Rewrite or rephrase document content',
        inputSchema: { type: 'object', properties: { content: { type: 'string' }, instructions: { type: 'string' } }, required: ['content'] },
        serverName: 'Foxit',
        isAI: true,
      },
      {
        name: 'ai_classify',
        description: 'Classify document type and sensitivity',
        inputSchema: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] },
        serverName: 'Foxit',
        isAI: true,
      },
      {
        name: 'ai_extract_fields',
        description: 'Extract structured fields from a document',
        inputSchema: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] },
        serverName: 'Foxit',
        isAI: true,
      },
      {
        name: 'ai_check_sensitive',
        description: 'Detect PII and sensitive content',
        inputSchema: { type: 'object', properties: { content: { type: 'string' } }, required: ['content'] },
        serverName: 'Foxit',
        isAI: true,
      },
    ],
  },
  {
    id: 'google-drive',
    name: 'Google Drive',
    description: 'Trigger flows from uploads, read and write files to Google Drive',
    category: 'Storage',
    endpointUrl: 'https://mcp.googleapis.com/drive/v1',
    transport: 'streamable-http',
    status: 'disconnected',
    isBuiltIn: false,
    authType: 'oauth',
    tools: [
      {
        name: 'read_file',
        description: 'Read a file from Google Drive',
        inputSchema: {
          type: 'object',
          properties: {
            fileId: { type: 'string', description: 'Google Drive file ID' },
          },
          required: ['fileId'],
        },
        serverName: 'Google Drive',
      },
      {
        name: 'list_files',
        description: 'List files in Google Drive',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query' },
            folderId: { type: 'string', description: 'Parent folder ID' },
          },
        },
        serverName: 'Google Drive',
      },
      {
        name: 'upload_file',
        description: 'Upload a file to Google Drive',
        inputSchema: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'File reference to upload' },
            folderId: { type: 'string', description: 'Destination folder ID' },
            name: { type: 'string', description: 'File name in Drive' },
          },
          required: ['file'],
        },
        serverName: 'Google Drive',
      },
      {
        name: 'move_file',
        description: 'Move a file to a different folder in Google Drive',
        inputSchema: {
          type: 'object',
          properties: {
            fileId: { type: 'string', description: 'File ID to move' },
            destinationFolderId: { type: 'string', description: 'Target folder ID' },
          },
          required: ['fileId', 'destinationFolderId'],
        },
        serverName: 'Google Drive',
      },
    ],
  },
  {
    id: 'gmail',
    name: 'Gmail',
    description: 'Send emails, read messages, and trigger workflows on receipt',
    category: 'Communication',
    endpointUrl: 'https://mcp.googleapis.com/gmail/v1',
    transport: 'streamable-http',
    status: 'disconnected',
    isBuiltIn: false,
    authType: 'oauth',
    tools: [
      {
        name: 'send_email',
        description: 'Send an email via Gmail',
        inputSchema: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient email address' },
            subject: { type: 'string', description: 'Email subject' },
            body: { type: 'string', description: 'Email body content' },
          },
          required: ['to', 'subject', 'body'],
        },
        serverName: 'Gmail',
      },
      {
        name: 'read_message',
        description: 'Read an email message from Gmail',
        inputSchema: {
          type: 'object',
          properties: {
            messageId: { type: 'string', description: 'Gmail message ID' },
          },
          required: ['messageId'],
        },
        serverName: 'Gmail',
      },
      {
        name: 'search_messages',
        description: 'Search for messages in Gmail',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Gmail search query' },
            maxResults: { type: 'number', description: 'Maximum number of results' },
          },
          required: ['query'],
        },
        serverName: 'Gmail',
      },
    ],
  },
  {
    id: 'hubspot',
    name: 'HubSpot',
    description: 'Update deals, create contacts, and attach documents',
    category: 'CRM',
    endpointUrl: 'https://mcp.hubspot.com/v1',
    transport: 'streamable-http',
    status: 'disconnected',
    isBuiltIn: false,
    authType: 'oauth',
    tools: [
      {
        name: 'create_contact',
        description: 'Create a new contact in HubSpot',
        inputSchema: {
          type: 'object',
          properties: {
            email: { type: 'string', description: 'Contact email address' },
            firstName: { type: 'string', description: 'First name' },
            lastName: { type: 'string', description: 'Last name' },
          },
          required: ['email'],
        },
        serverName: 'HubSpot',
      },
      {
        name: 'update_deal',
        description: 'Update a deal in HubSpot',
        inputSchema: {
          type: 'object',
          properties: {
            dealId: { type: 'string', description: 'HubSpot deal ID' },
            stage: { type: 'string', description: 'Deal stage' },
            amount: { type: 'number', description: 'Deal amount' },
          },
          required: ['dealId'],
        },
        serverName: 'HubSpot',
      },
      {
        name: 'log_activity',
        description: 'Log an activity in HubSpot',
        inputSchema: {
          type: 'object',
          properties: {
            contactId: { type: 'string', description: 'Associated contact ID' },
            activityType: { type: 'string', description: 'Type of activity' },
            notes: { type: 'string', description: 'Activity notes' },
          },
          required: ['contactId', 'activityType'],
        },
        serverName: 'HubSpot',
      },
    ],
  },
  {
    id: 'notion',
    name: 'Notion',
    description: 'Write to databases, create pages, and query Notion workspaces',
    category: 'Project Management',
    endpointUrl: 'https://mcp.notion.so/v1',
    transport: 'streamable-http',
    status: 'disconnected',
    isBuiltIn: false,
    authType: 'oauth',
    tools: [
      {
        name: 'create_page',
        description: 'Create a new page in Notion',
        inputSchema: {
          type: 'object',
          properties: {
            parentId: { type: 'string', description: 'Parent page or database ID' },
            title: { type: 'string', description: 'Page title' },
            content: { type: 'string', description: 'Page content in markdown' },
          },
          required: ['parentId', 'title'],
        },
        serverName: 'Notion',
      },
      {
        name: 'write_database_row',
        description: 'Write a row to a Notion database',
        inputSchema: {
          type: 'object',
          properties: {
            databaseId: { type: 'string', description: 'Notion database ID' },
            properties: { type: 'object', description: 'Row property values' },
          },
          required: ['databaseId', 'properties'],
        },
        serverName: 'Notion',
      },
      {
        name: 'query_database',
        description: 'Query a Notion database',
        inputSchema: {
          type: 'object',
          properties: {
            databaseId: { type: 'string', description: 'Notion database ID' },
            filter: { type: 'object', description: 'Query filter' },
          },
          required: ['databaseId'],
        },
        serverName: 'Notion',
      },
    ],
  },
  {
    id: 'jira',
    name: 'Jira',
    description: 'Create and update issues, link document sections to tickets',
    category: 'Project Management',
    endpointUrl: 'https://mcp.atlassian.com/jira/v1',
    transport: 'streamable-http',
    status: 'disconnected',
    isBuiltIn: false,
    authType: 'oauth',
    tools: [
      {
        name: 'create_issue',
        description: 'Create a new issue in Jira',
        inputSchema: {
          type: 'object',
          properties: {
            projectKey: { type: 'string', description: 'Jira project key' },
            summary: { type: 'string', description: 'Issue summary' },
            issueType: { type: 'string', description: 'Issue type (Bug, Task, Story)' },
            description: { type: 'string', description: 'Issue description' },
          },
          required: ['projectKey', 'summary', 'issueType'],
        },
        serverName: 'Jira',
      },
      {
        name: 'update_issue',
        description: 'Update an existing Jira issue',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string', description: 'Jira issue key (e.g., PROJ-123)' },
            status: { type: 'string', description: 'New status' },
            assignee: { type: 'string', description: 'Assignee user ID' },
          },
          required: ['issueKey'],
        },
        serverName: 'Jira',
      },
      {
        name: 'link_document',
        description: 'Link a document to a Jira issue',
        inputSchema: {
          type: 'object',
          properties: {
            issueKey: { type: 'string', description: 'Jira issue key' },
            documentUrl: { type: 'string', description: 'URL of the document to link' },
            title: { type: 'string', description: 'Link title' },
          },
          required: ['issueKey', 'documentUrl'],
        },
        serverName: 'Jira',
      },
    ],
  },
  {
    id: 'salesforce',
    name: 'Salesforce',
    description: 'Update records, create contacts, and log activity in Salesforce',
    category: 'CRM',
    endpointUrl: 'https://mcp.salesforce.com/v1',
    transport: 'streamable-http',
    status: 'disconnected',
    isBuiltIn: false,
    authType: 'oauth',
    tools: [
      {
        name: 'update_opportunity',
        description: 'Update an opportunity in Salesforce',
        inputSchema: {
          type: 'object',
          properties: {
            opportunityId: { type: 'string', description: 'Salesforce opportunity ID' },
            stage: { type: 'string', description: 'Opportunity stage' },
            amount: { type: 'number', description: 'Opportunity amount' },
          },
          required: ['opportunityId'],
        },
        serverName: 'Salesforce',
      },
      {
        name: 'create_record',
        description: 'Create a record in Salesforce',
        inputSchema: {
          type: 'object',
          properties: {
            objectType: { type: 'string', description: 'Salesforce object type' },
            fields: { type: 'object', description: 'Record field values' },
          },
          required: ['objectType', 'fields'],
        },
        serverName: 'Salesforce',
      },
      {
        name: 'query_object',
        description: 'Query a Salesforce object using SOQL',
        inputSchema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'SOQL query string' },
          },
          required: ['query'],
        },
        serverName: 'Salesforce',
      },
    ],
  },
  {
    id: 'dropbox',
    name: 'Dropbox',
    description: 'Store and retrieve documents, trigger workflows on file events',
    category: 'Storage',
    endpointUrl: 'https://mcp.dropbox.com/v1',
    transport: 'streamable-http',
    status: 'disconnected',
    isBuiltIn: false,
    authType: 'oauth',
    tools: [
      {
        name: 'upload_file',
        description: 'Upload a file to Dropbox',
        inputSchema: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'File reference to upload' },
            path: { type: 'string', description: 'Destination path in Dropbox' },
          },
          required: ['file', 'path'],
        },
        serverName: 'Dropbox',
      },
      {
        name: 'download_file',
        description: 'Download a file from Dropbox',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path in Dropbox' },
          },
          required: ['path'],
        },
        serverName: 'Dropbox',
      },
      {
        name: 'list_folder',
        description: 'List files and folders in a Dropbox directory',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Folder path to list' },
          },
          required: ['path'],
        },
        serverName: 'Dropbox',
      },
    ],
  },
  {
    id: 'box',
    name: 'Box',
    description: 'Enterprise file storage with folder-based triggers and access control',
    category: 'Storage',
    endpointUrl: 'https://mcp.box.com/v1',
    transport: 'streamable-http',
    status: 'disconnected',
    isBuiltIn: false,
    authType: 'oauth',
    tools: [
      {
        name: 'upload_file',
        description: 'Upload a file to Box',
        inputSchema: {
          type: 'object',
          properties: {
            file: { type: 'string', description: 'File reference to upload' },
            folderId: { type: 'string', description: 'Destination folder ID' },
          },
          required: ['file', 'folderId'],
        },
        serverName: 'Box',
      },
      {
        name: 'download_file',
        description: 'Download a file from Box',
        inputSchema: {
          type: 'object',
          properties: {
            fileId: { type: 'string', description: 'Box file ID' },
          },
          required: ['fileId'],
        },
        serverName: 'Box',
      },
      {
        name: 'list_folder_items',
        description: 'List items in a Box folder',
        inputSchema: {
          type: 'object',
          properties: {
            folderId: { type: 'string', description: 'Box folder ID' },
          },
          required: ['folderId'],
        },
        serverName: 'Box',
      },
    ],
  },
  {
    id: 'slack',
    name: 'Slack',
    description: 'Send notifications, post to channels, and trigger on messages',
    category: 'Communication',
    endpointUrl: 'https://mcp.slack.com/v1',
    transport: 'streamable-http',
    status: 'disconnected',
    isBuiltIn: false,
    authType: 'oauth',
    tools: [
      {
        name: 'send_message',
        description: 'Send a message to a Slack channel',
        inputSchema: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'Channel name or ID' },
            text: { type: 'string', description: 'Message text' },
          },
          required: ['channel', 'text'],
        },
        serverName: 'Slack',
      },
      {
        name: 'send_direct_message',
        description: 'Send a direct message to a Slack user',
        inputSchema: {
          type: 'object',
          properties: {
            userId: { type: 'string', description: 'Slack user ID' },
            text: { type: 'string', description: 'Message text' },
          },
          required: ['userId', 'text'],
        },
        serverName: 'Slack',
      },
      {
        name: 'upload_file',
        description: 'Upload a file to a Slack channel',
        inputSchema: {
          type: 'object',
          properties: {
            channel: { type: 'string', description: 'Channel name or ID' },
            file: { type: 'string', description: 'File reference to upload' },
            title: { type: 'string', description: 'File title' },
          },
          required: ['channel', 'file'],
        },
        serverName: 'Slack',
      },
    ],
  },
  {
    id: 'asana',
    name: 'Asana',
    description: 'Create tasks from document fields and manage project workflows',
    category: 'Project Management',
    endpointUrl: 'https://mcp.asana.com/v1',
    transport: 'streamable-http',
    status: 'disconnected',
    isBuiltIn: false,
    authType: 'oauth',
    tools: [
      {
        name: 'create_task',
        description: 'Create a new task in Asana',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', description: 'Asana project ID' },
            name: { type: 'string', description: 'Task name' },
            notes: { type: 'string', description: 'Task description' },
            assignee: { type: 'string', description: 'Assignee email or ID' },
          },
          required: ['projectId', 'name'],
        },
        serverName: 'Asana',
      },
      {
        name: 'update_task',
        description: 'Update an existing Asana task',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Asana task ID' },
            completed: { type: 'boolean', description: 'Mark task complete' },
            notes: { type: 'string', description: 'Updated notes' },
          },
          required: ['taskId'],
        },
        serverName: 'Asana',
      },
      {
        name: 'add_attachment',
        description: 'Attach a file to an Asana task',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', description: 'Asana task ID' },
            file: { type: 'string', description: 'File reference to attach' },
          },
          required: ['taskId', 'file'],
        },
        serverName: 'Asana',
      },
    ],
  },
];

/** Display labels for Foxit PDF MCP tool nodes */
export const foxitToolLabels: Record<string, string> = {
  convert_pdf_to_file: 'Convert PDF',
  convert_file_to_pdf: 'Convert to PDF',
  combine_pdfs: 'Combine PDFs',
  compare_pdfs: 'Compare PDFs',
  compress_pdf: 'Compress PDF',
  extract_pdf: 'Extract PDF',
  flatten_pdf: 'Flatten PDF',
};
