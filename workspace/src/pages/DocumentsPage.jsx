import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocuments, useDownloadDocument } from '../queries/documents';
import DataTable from '../components/ui/DataTable';
import EmptyState from '../components/ui/EmptyState';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { FileText, Download, Search, FileUp } from 'lucide-react';
import { useToast } from '../components/ui/Toast';

export default function DocumentsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const { data: documents = [], isLoading } = useDocuments();
  const downloadDoc = useDownloadDocument();
  const { addToast } = useToast();

  const handleDownload = (doc) => {
    downloadDoc.mutate(
      { type: doc.type || doc.documentType, bookingId: doc.bookingId },
      {
        onSuccess: () =>
          addToast({ title: 'Download Started', message: 'Your document is downloading.', type: 'success' }),
        onError: (err) => addToast({ title: 'Download Failed', message: err.message, type: 'error' })
      }
    );
  };

  const filteredDocs = documents.filter(
    (d) =>
      !search ||
      d.fileName?.toLowerCase().includes(search.toLowerCase()) ||
      d.documentType?.toLowerCase().includes(search.toLowerCase())
  );

  const columns = [
    {
      header: 'Document Name',
      accessor: 'fileName',
      cell: (row) => (
        <div className="row">
          <FileText size={16} color="var(--brand)" style={{ marginRight: 'var(--space-2)' }} />
          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{row.fileName || `${row.documentType}.pdf`}</span>
        </div>
      )
    },
    {
      header: 'Type',
      accessor: 'documentType',
      cell: (row) => (
        <span className="text-secondary" style={{ textTransform: 'capitalize' }}>
          {row.documentType?.replace('_', ' ')}
        </span>
      )
    },
    {
      header: 'Status',
      accessor: 'status',
      cell: (row) => (
        <Badge variant={row.status === 'verified' ? 'success' : row.status === 'rejected' ? 'danger' : 'warning'}>
          {row.status || 'Pending'}
        </Badge>
      )
    },
    {
      header: 'Date Added',
      accessor: 'createdAt',
      cell: (row) => <span className="text-muted">{new Date(row.createdAt || Date.now()).toLocaleDateString()}</span>
    },
    {
      header: 'Actions',
      accessor: 'id',
      align: 'right',
      cell: (row) => (
        <Button
          variant="ghost"
          size="sm"
          icon={Download}
          onClick={() => handleDownload(row)}
          disabled={downloadDoc.isPending}
        >
          Download
        </Button>
      )
    }
  ];

  return (
    <div className="animate-fade-in stack-lg">
      <div className="page-header" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
        <div className="row-between" style={{ marginBottom: 'var(--space-4)' }}>
          <div>
            <h1 className="page-title">Documents</h1>
            <p className="text-secondary">Access your Waybills, Proof of Delivery, and KYC files.</p>
          </div>

          <Button variant="primary" icon={FileUp} onClick={() => navigate('/app/onboarding')}>
            Upload Document
          </Button>
        </div>

        <div className="input-group" style={{ margin: 0, position: 'relative', maxWidth: 400 }}>
          <Search
            size={20}
            color="var(--text-muted)"
            style={{ position: 'absolute', left: 'var(--space-3)', top: '50%', transform: 'translateY(-50%)' }}
          />
          <input
            className="input-field"
            placeholder="Search by file name or type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ paddingLeft: 'var(--space-10)' }}
          />
        </div>
      </div>

      <div className="glass-panel" style={{ padding: 0 }}>
        {filteredDocs.length === 0 && !isLoading ? (
          <EmptyState
            icon={FileText}
            title="No documents found"
            description="You don't have any uploaded documents or waybills."
          />
        ) : (
          <DataTable columns={columns} data={filteredDocs} loading={isLoading} />
        )}
      </div>
    </div>
  );
}
