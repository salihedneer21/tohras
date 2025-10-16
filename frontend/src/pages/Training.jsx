import { useState, useEffect } from 'react';
import { userAPI, trainingAPI } from '../services/api';
import toast from 'react-hot-toast';

function Training() {
  const [users, setUsers] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [zipFile, setZipFile] = useState(null);
  const [formData, setFormData] = useState({
    userId: '',
    imageUrls: [],
    modelName: '',
  });
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    fetchData();

    // Auto-refresh every 10 seconds to check training status
    const interval = setInterval(() => {
      fetchData();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersResponse, trainingsResponse] = await Promise.all([
        userAPI.getAll(),
        trainingAPI.getAll(),
      ]);
      setUsers(usersResponse.data);
      setTrainings(trainingsResponse.data);
    } catch (error) {
      toast.error(`Failed to fetch data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddImageUrl = () => {
    if (imageUrl.trim()) {
      setFormData((prev) => ({
        ...prev,
        imageUrls: [...prev.imageUrls, imageUrl.trim()],
      }));
      setImageUrl('');
    }
  };

  const handleRemoveImageUrl = (index) => {
    setFormData((prev) => ({
      ...prev,
      imageUrls: prev.imageUrls.filter((_, i) => i !== index),
    }));
  };

  const handleLoadUserImages = () => {
    const selectedUser = users.find((u) => u._id === formData.userId);
    if (selectedUser && selectedUser.imageUrls && selectedUser.imageUrls.length > 0) {
      setFormData((prev) => ({
        ...prev,
        imageUrls: [...new Set([...prev.imageUrls, ...selectedUser.imageUrls])],
      }));
      toast.success('User images loaded');
    } else {
      toast.error('No images found for this user');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.imageUrls.length === 0 && !zipFile) {
      toast.error('Add at least one image URL or upload a training ZIP');
      return;
    }

    try {
      let payload = formData;

      if (zipFile) {
        payload = new FormData();
        payload.append('userId', formData.userId);
        payload.append('modelName', formData.modelName);
        payload.append('imageUrls', JSON.stringify(formData.imageUrls));
        payload.append('trainingZip', zipFile);
      }

      await trainingAPI.create(payload);
      toast.success('Training started successfully');
      resetForm();
      fetchData();
    } catch (error) {
      toast.error(`Failed to start training: ${error.message}`);
    }
  };

  const handleCheckStatus = async (id) => {
    try {
      const response = await trainingAPI.checkStatus(id);
      toast.success(`Status updated: ${response.data.status}`);
      fetchData();
    } catch (error) {
      toast.error(`Failed to check status: ${error.message}`);
    }
  };

  const handleCancelTraining = async (id) => {
    if (window.confirm('Are you sure you want to cancel this training?')) {
      try {
        await trainingAPI.cancel(id);
        toast.success('Training canceled');
        fetchData();
      } catch (error) {
        toast.error(`Failed to cancel training: ${error.message}`);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      userId: '',
      imageUrls: [],
      modelName: '',
    });
    setZipFile(null);
    setImageUrl('');
    setShowForm(false);
  };

  const getStatusClass = (status) => {
    return `status-badge status-${status.toLowerCase()}`;
  };

  if (loading) {
    return <div className="loading">Loading training data</div>;
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h2 className="page-title">Model Training</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Start Training'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h3 style={{ marginBottom: '20px' }}>Start New Training</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Select User *</label>
              <select name="userId" value={formData.userId} onChange={handleInputChange} required>
                <option value="">-- Select a user --</option>
                {users.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Model Name (Optional)</label>
              <input
                type="text"
                name="modelName"
                value={formData.modelName}
                onChange={handleInputChange}
                placeholder="e.g., john_character"
              />
            </div>

            <div className="form-group">
              <label>Training Image URLs *</label>
              <div className="url-input-group">
                <input
                  type="url"
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                />
                <button type="button" className="btn btn-secondary" onClick={handleAddImageUrl}>
                  Add URL
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={handleLoadUserImages}
                  disabled={!formData.userId}
                >
                  Load User Images
                </button>
              </div>
              {formData.imageUrls.length > 0 && (
                <ul className="url-list">
                  {formData.imageUrls.map((url, index) => (
                    <li key={index} className="url-item">
                      <span>{url}</span>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => handleRemoveImageUrl(index)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <p style={{ fontSize: '14px', color: formData.imageUrls.length < 10 ? '#e53e3e' : '#48bb78', marginTop: '8px' }}>
                Total images: {formData.imageUrls.length}
                {formData.imageUrls.length < 10 && ' ⚠️ Replicate recommends at least 10 images for best results'}
                {formData.imageUrls.length >= 10 && ' ✓ Good number of training images'}
              </p>
              <p style={{ fontSize: '12px', color: '#718096', marginTop: '4px' }}>
                You can also upload a ZIP that contains your training images.
              </p>
            </div>

            <div className="form-group">
              <label>Upload Training ZIP (Optional)</label>
              <input
                type="file"
                accept=".zip"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  const allowedMimeTypes = ['application/zip', 'application/x-zip-compressed', 'multipart/x-zip', 'application/octet-stream'];
                  if (file && !allowedMimeTypes.includes(file.type) && !file.name.toLowerCase().endsWith('.zip')) {
                    toast.error('Please select a valid ZIP file');
                    e.target.value = '';
                    return;
                  }
                  setZipFile(file || null);
                }}
              />
              {zipFile && (
                <div style={{ fontSize: '14px', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span>{zipFile.name}</span>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => setZipFile(null)}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>

            <div className="button-group">
              <button type="submit" className="btn btn-primary">
                Start Training
              </button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <h3 style={{ marginTop: '40px', marginBottom: '20px' }}>Training History</h3>
      <div className="training-list">
        {trainings.map((training) => (
          <div key={training._id} className="training-item">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div style={{ flex: 1 }}>
                <h4 style={{ marginBottom: '8px' }}>{training.modelName}</h4>
                <p style={{ color: '#718096', fontSize: '14px', marginBottom: '8px' }}>
                  User: {training.userId?.name} ({training.userId?.email})
                </p>
                <p style={{ color: '#718096', fontSize: '14px', marginBottom: '8px' }}>
                  Images: {training.imageUrls?.length || 0}
                  {training.trainingConfig?.source === 'upload' && (
                    <span style={{ marginLeft: '6px', color: '#3182ce' }}>(ZIP upload)</span>
                  )}
                </p>
                {training.trainingConfig?.originalZipName && (
                  <p style={{ color: '#718096', fontSize: '12px', marginBottom: '8px' }}>
                    Uploaded ZIP: {training.trainingConfig.originalZipName}
                  </p>
                )}
                <p style={{ color: '#718096', fontSize: '14px', marginBottom: '8px' }}>
                  Started: {new Date(training.createdAt).toLocaleString()}
                </p>
                {training.completedAt && (
                  <p style={{ color: '#718096', fontSize: '14px', marginBottom: '8px' }}>
                    Completed: {new Date(training.completedAt).toLocaleString()}
                  </p>
                )}
                {training.modelVersion && (
                  <p style={{ color: '#48bb78', fontSize: '12px', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                    Model: {training.modelVersion}
                  </p>
                )}
                {training.error && (
                  <p style={{ color: '#e53e3e', fontSize: '12px', marginTop: '8px' }}>
                    Error: {training.error}
                  </p>
                )}
                {training.logsUrl && (
                  <p style={{ fontSize: '12px', marginTop: '4px' }}>
                    <a href={training.logsUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#667eea' }}>
                      View Training Logs
                    </a>
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className={getStatusClass(training.status)}>{training.status}</span>
                  {(training.status === 'starting' || training.status === 'processing') && (
                    <span style={{ fontSize: '12px', color: '#667eea', animation: 'pulse 2s infinite' }}>
                      ●
                    </span>
                  )}
                </div>
                <div className="button-group">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleCheckStatus(training._id)}
                  >
                    Refresh Status
                  </button>
                  {(training.status === 'starting' || training.status === 'processing') && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => handleCancelTraining(training._id)}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {trainings.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#718096' }}>
          No training jobs found. Start your first training to create custom models!
        </div>
      )}
    </div>
  );
}

export default Training;
