import { useState, useEffect } from 'react';
import { userAPI } from '../services/api';
import toast from 'react-hot-toast';

function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    age: '',
    gender: 'male',
    email: '',
    countryCode: '+1',
    phoneNumber: '',
    imageUrls: [],
  });
  const [imageUrl, setImageUrl] = useState('');
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const response = await userAPI.getAll();
      setUsers(response.data);
    } catch (error) {
      toast.error(`Failed to fetch users: ${error.message}`);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await userAPI.update(editingId, formData);
        toast.success('User updated successfully');
      } else {
        await userAPI.create(formData);
        toast.success('User created successfully');
      }
      resetForm();
      fetchUsers();
    } catch (error) {
      toast.error(`Failed to save user: ${error.message}`);
    }
  };

  const handleEdit = (user) => {
    setFormData({
      name: user.name,
      age: user.age,
      gender: user.gender,
      email: user.email,
      countryCode: user.countryCode,
      phoneNumber: user.phoneNumber,
      imageUrls: user.imageUrls || [],
    });
    setEditingId(user._id);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this user?')) {
      try {
        await userAPI.delete(id);
        toast.success('User deleted successfully');
        fetchUsers();
      } catch (error) {
        toast.error(`Failed to delete user: ${error.message}`);
      }
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      age: '',
      gender: 'male',
      email: '',
      countryCode: '+1',
      phoneNumber: '',
      imageUrls: [],
    });
    setImageUrl('');
    setEditingId(null);
    setShowForm(false);
  };

  if (loading) {
    return <div className="loading">Loading users</div>;
  }

  return (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h2 className="page-title">User Management</h2>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add User'}
        </button>
      </div>

      {showForm && (
        <div className="card">
          <h3 style={{ marginBottom: '20px' }}>{editingId ? 'Edit User' : 'Add New User'}</h3>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Name *</label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Age *</label>
                <input
                  type="number"
                  name="age"
                  value={formData.age}
                  onChange={handleInputChange}
                  min="1"
                  max="150"
                  required
                />
              </div>
              <div className="form-group">
                <label>Gender *</label>
                <select name="gender" value={formData.gender} onChange={handleInputChange} required>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Email *</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                />
              </div>
              <div className="form-group">
                <label>Country Code *</label>
                <input
                  type="text"
                  name="countryCode"
                  value={formData.countryCode}
                  onChange={handleInputChange}
                  placeholder="+1"
                  required
                />
              </div>
              <div className="form-group">
                <label>Phone Number *</label>
                <input
                  type="tel"
                  name="phoneNumber"
                  value={formData.phoneNumber}
                  onChange={handleInputChange}
                  placeholder="1234567890"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Image URLs (Optional)</label>
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
            </div>

            <div className="button-group">
              <button type="submit" className="btn btn-primary">
                {editingId ? 'Update User' : 'Create User'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={resetForm}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="users-grid">
        {users.map((user) => (
          <div key={user._id} className="user-card">
            <h3>{user.name}</h3>
            <div className="user-info">
              <p><strong>Age:</strong> {user.age}</p>
              <p><strong>Gender:</strong> {user.gender}</p>
              <p><strong>Email:</strong> {user.email}</p>
              <p><strong>Phone:</strong> {user.countryCode}{user.phoneNumber}</p>
              <p><strong>Images:</strong> {user.imageUrls?.length || 0}</p>
            </div>
            <div className="button-group">
              <button className="btn btn-primary btn-sm" onClick={() => handleEdit(user)}>
                Edit
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(user._id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {users.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '40px', color: '#718096' }}>
          No users found. Add your first user to get started!
        </div>
      )}
    </div>
  );
}

export default Users;
