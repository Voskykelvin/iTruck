import { useState, useRef } from 'react';
import { useSessionBootstrap, useUploadProfileDocument } from '../queries/session';
import Button from '../components/ui/Button';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { ShieldCheck, UploadCloud, CheckCircle, FileText } from 'lucide-react';
import { useToast } from '../components/ui/Toast';
import {
  missingRequiredProfileDocuments,
  profileDocumentsForRole,
  findProfileDocument,
  reviewReadyDocument
} from '../utils/helpers';
import { useNavigate } from 'react-router-dom';

export default function OnboardingPage() {
  const { data: user, isLoading } = useSessionBootstrap();
  const uploadDoc = useUploadProfileDocument();
  const { addToast } = useToast();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);

  const [activeDocType, setActiveDocType] = useState(null);

  if (isLoading || !user)
    return (
      <div className="page-header">
        <h1 className="page-title">Loading...</h1>
      </div>
    );

  const role = user.role;
  const requiredDocs = profileDocumentsForRole(role);
  const missingDocs = missingRequiredProfileDocuments(user, role);
  const isComplete = missingDocs.length === 0;
  const isApproved = isComplete && user.isVerified === true;

  const triggerUpload = (docLabel) => {
    setActiveDocType(docLabel);
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeDocType) return;

    try {
      await uploadDoc.mutateAsync({ documentType: activeDocType, file });
      addToast({ title: 'Document Uploaded', message: `${activeDocType} uploaded successfully.`, type: 'success' });
    } catch (err) {
      addToast({ title: 'Upload Failed', message: err.message, type: 'error' });
    } finally {
      setActiveDocType(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="animate-fade-in stack-lg" style={{ maxWidth: 800, margin: '0 auto' }}>
      <div
        className="page-header"
        style={{ flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 'var(--space-8)' }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: isComplete ? 'var(--success-soft)' : 'var(--brand-soft)',
            color: isComplete ? 'var(--success)' : 'var(--brand)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 'var(--space-4)'
          }}
        >
          <ShieldCheck size={32} />
        </div>
        <h1 className="page-title">Identity Verification</h1>
        <p className="text-secondary" style={{ maxWidth: 500 }}>
          {isApproved
            ? 'Your identity and business documents are verified. Keep them current to retain access to protected workflows.'
            : isComplete
              ? 'Your identity documents have been submitted and are under review by our team. You can proceed to the dashboard.'
              : 'To ensure a safe and secure platform, please upload the required documents to verify your identity and business.'}
        </p>

        {isComplete && (
          <Button
            variant="primary"
            style={{ marginTop: 'var(--space-4)' }}
            onClick={() => navigate(role === 'owner' ? '/app/owner' : '/app/shipper')}
          >
            Go to Dashboard
          </Button>
        )}
      </div>

      <div className="stack">
        <div className="row-between">
          <h3 style={{ margin: 0 }}>Required Documents</h3>
          <Badge variant={isComplete ? 'success' : 'warning'}>
            {isApproved ? 'Approved' : isComplete ? 'Under Review' : `${missingDocs.length} remaining`}
          </Badge>
        </div>

        <div className="stack-sm">
          {requiredDocs.map((docLabel) => {
            const existingDoc = findProfileDocument(user.documents, docLabel, role);
            const isReady = reviewReadyDocument(existingDoc);
            const statusLabel = existingDoc?.status || 'missing';

            return (
              <Card key={docLabel} className="row-between hover-lift" style={{ padding: 'var(--space-4)' }}>
                <div className="row">
                  <div
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 'var(--radius)',
                      background: isReady ? 'var(--success-soft)' : 'var(--surface-2)',
                      color: isReady ? 'var(--success)' : 'var(--text-muted)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {isReady ? <CheckCircle size={24} /> : <FileText size={24} />}
                  </div>
                  <div style={{ marginLeft: 'var(--space-4)' }}>
                    <div style={{ fontWeight: 600, color: 'var(--ink)' }}>{docLabel}</div>
                    <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                      {statusLabel === 'approved' && 'Verified by Admin'}
                      {statusLabel === 'pending' && 'Under review...'}
                      {statusLabel === 'rejected' && (
                        <span style={{ color: 'var(--danger)' }}>Rejected - Please upload again</span>
                      )}
                      {statusLabel === 'missing' && 'Please upload a clear, legible copy.'}
                    </div>
                  </div>
                </div>

                {!isReady && (
                  <Button
                    variant="secondary"
                    icon={UploadCloud}
                    onClick={() => triggerUpload(docLabel)}
                    loading={uploadDoc.isPending && activeDocType === docLabel}
                  >
                    Upload
                  </Button>
                )}
                {isReady && <Badge variant="success">Submitted</Badge>}
              </Card>
            );
          })}
        </div>
      </div>

      <input
        type="file"
        accept="image/jpeg, image/png, image/webp, application/pdf"
        ref={fileInputRef}
        onChange={handleFileUpload}
        hidden
      />
    </div>
  );
}
