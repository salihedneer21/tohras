import { useState, useEffect } from 'react';
import { userAPI, trainingAPI, generationAPI } from '../services/api';
import toast from 'react-hot-toast';

const NUMERIC_CONFIG_FIELDS = new Set(['numOutputs', 'guidanceScale', 'outputQuality']);

function Generate() {
  const [users, setUsers] = useState([]);
  const [trainings, setTrainings] = useState([]);
  const [generations, setGenerations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    userId: '',
    trainingId: '',
    prompt: '',
    config: {
      numOutputs: 1,
      aspectRatio: '1:1',
      outputFormat: 'webp',
      guidanceScale: 3,
      outputQuality: 80,
    },
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [usersResponse, generationsResponse] = await Promise.all([
        userAPI.getAll(),
        generationAPI.getAll(),
      ]);
      setUsers(usersResponse.data);
      setGenerations(generationsResponse.data);
    } catch (error) {
      toast.error(`Failed to fetch data: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleUserChange = async (e) => {
    const userId = e.target.value;
    setFormData((prev) => ({ ...prev, userId, trainingId: '' }));

    if (userId) {
      try {
        const response = await trainingAPI.getUserSuccessful(userId);
        setTrainings(response.data);
      } catch (error) {
        toast.error(`Failed to fetch trainings: ${error.message}`);
        setTrainings([]);
      }
    } else {
      setTrainings([]);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleConfigChange = (e) => {
    const { name, value } = e.target;
    let parsedValue = value;

    if (NUMERIC_CONFIG_FIELDS.has(name) && value !== '') {
      const numericValue = Number(value);
      parsedValue = Number.isNaN(numericValue) ? value : numericValue;
    }

    setFormData((prev) => ({
      ...prev,
      config: { ...prev.config, [name]: parsedValue },
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await generationAPI.create(formData);
      toast.success('Image generation started! Check below for results.');
      resetForm();

      // Poll for updates
      setTimeout(() => {
        fetchData();
      }, 3000);
    } catch (error) {
      toast.error(`Failed to generate image: ${error.message}`);
    }
  };

  const handleRefresh = async (id) => {
    try {
      const response = await generationAPI.getById(id);
      toast.success(`Status: ${response.data.status}`);
      fetchData();
    } catch (error) {
      toast.error(`Failed to refresh: ${error.message}`);
    }
  };

  const handleDownload = async (id) => {
    try {
      await generationAPI.download(id);
      toast.success('Images downloaded successfully');
    } catch (error) {
      toast.error(`Failed to download: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormData({
      userId: '',
      trainingId: '',
      prompt: '',
      config: {
        numOutputs: 1,
        aspectRatio: '1:1',
        outputFormat: 'webp',
        guidanceScale: 3,
        outputQuality: 80,
      },
    });
    setTrainings([]);
    setShowForm(false);
  };

  const getStatusClass = (status) => {
    return `status-badge status-${status.toLowerCase()}`;
  };

  if (loading) {
    return <div className="loading">Loading generation data</div>;
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h2 className="page-title">Image Generation</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Generate Images'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h3 style={{ marginBottom: '20px' }}>Generate New Images</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Select User *</label>
              <select name="userId" value={formData.userId} onChange={handleUserChange} required>
                <option value="">-- Select a user --</option>
                {users.map((user) => (
                  <option key={user._id} value={user._id}>
                    {user.name} ({user.email})
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label>Select Trained Model *</label>
              <select
                name="trainingId"
                value={formData.trainingId}
                onChange={handleInputChange}
                required
                disabled={!formData.userId || trainings.length === 0}
              >
                <option value="">-- Select a trained model --</option>
                {trainings.map((training) => (
                  <option key={training._id} value={training._id}>
                    {training.modelName} - {new Date(training.completedAt).toLocaleDateString()}
                  </option>
                ))}
              </select>
              {formData.userId && trainings.length === 0 && (
                <p style={{ fontSize: '14px', color: '#e53e3e', marginTop: '8px' }}>
                  No trained models available for this user. Please train a model first.
                </p>
              )}
            </div>

            <div className="form-group">
              <label>Prompt *</label>
              <textarea
                name="prompt"
                value={formData.prompt}
                onChange={handleInputChange}
                rows="4"
                placeholder="Describe the image you want to generate..."
                required
              />
            </div>

            <h4 style={{ marginTop: '24px', marginBottom: '16px' }}>Generation Settings</h4>

            <div className="form-row">
              <div className="form-group">
                <label>Number of Outputs</label>
                <select name="numOutputs" value={formData.config.numOutputs} onChange={handleConfigChange}>
                  <option value="1">1</option>
                  <option value="2">2</option>
                  <option value="3">3</option>
                  <option value="4">4</option>
                </select>
              </div>

              <div className="form-group">
                <label>Aspect Ratio</label>
                <select name="aspectRatio" value={formData.config.aspectRatio} onChange={handleConfigChange}>
                  <option value="1:1">1:1 (Square)</option>
                  <option value="16:9">16:9 (Landscape)</option>
                  <option value="9:16">9:16 (Portrait)</option>
                  <option value="4:3">4:3</option>
                  <option value="3:4">3:4</option>
                </select>
              </div>

              <div className="form-group">
                <label>Output Format</label>
                <select name="outputFormat" value={formData.config.outputFormat} onChange={handleConfigChange}>
                  <option value="webp">WebP</option>
                  <option value="jpg">JPG</option>
                  <option value="png">PNG</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Guidance Scale: {formData.config.guidanceScale}</label>
                <input
                  type="range"
                  name="guidanceScale"
                  min="0"
                  max="10"
                  step="0.5"
                  value={formData.config.guidanceScale}
                  onChange={handleConfigChange}
                />
              </div>

              <div className="form-group">
                <label>Output Quality: {formData.config.outputQuality}%</label>
                <input
                  type="range"
                  name="outputQuality"
                  min="0"
                  max="100"
                  step="5"
                  value={formData.config.outputQuality}
                  onChange={handleConfigChange}
                />
              </div>
            </div>

            <div className="button-group">
              <button type="submit" className="btn btn-primary">
                Generate Images
              </button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <h3 style={{ marginTop: '40px', marginBottom: '20px' }}>Generation History</h3>
      <div className="generation-list">
        {generations.map((generation) => (
          <div key={generation._id} className="generation-item">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '16px' }}>
              <div style={{ flex: 1 }}>
                <h4 style={{ marginBottom: '8px' }}>
                  {generation.userId?.name} - {generation.trainingId?.modelName}
                </h4>
                <p style={{ color: '#4a5568', fontSize: '14px', marginBottom: '8px' }}>
                  <strong>Prompt:</strong> {generation.prompt}
                </p>
                <p style={{ color: '#718096', fontSize: '14px', marginBottom: '4px' }}>
                  Created: {new Date(generation.createdAt).toLocaleString()}
                </p>
                {generation.completedAt && (
                  <p style={{ color: '#718096', fontSize: '14px' }}>
                    Completed: {new Date(generation.completedAt).toLocaleString()}
                  </p>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'flex-end' }}>
                <span className={getStatusClass(generation.status)}>{generation.status}</span>
                <div className="button-group">
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => handleRefresh(generation._id)}
                  >
                    Refresh
                  </button>
                  {generation.status === 'succeeded' && (
                    <button
                      className="btn btn-success btn-sm"
                      onClick={() => handleDownload(generation._id)}
                    >
                      Download
                    </button>
                  )}
                </div>
              </div>
            </div>

            {generation.imageUrls && generation.imageUrls.length > 0 && (
              <div className="image-grid">
                {generation.imageUrls.map((url, index) => (
                  <div key={index} className="image-card">
                    <img src={url} alt={`Generated ${index + 1}`} />
                    <div className="image-card-content">
                      <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: '14px', color: '#667eea' }}>
                        View Full Size
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {generation.status === 'processing' && (
              <p style={{ color: '#4299e1', fontSize: '14px', marginTop: '8px' }}>
                Generating images, please wait...
              </p>
            )}

            {generation.error && (
              <p style={{ color: '#e53e3e', fontSize: '14px', marginTop: '8px' }}>
                Error: {generation.error}
              </p>
            )}
          </div>
        ))}
      </div>

      {generations.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#718096' }}>
          No generations found. Create your first image generation!
        </div>
      )}
    </div>
  );
}

export default Generate;
