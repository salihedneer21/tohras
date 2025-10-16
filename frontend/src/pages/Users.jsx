import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Users as UsersIcon, UserPlus, UserCircle2, Trash2, Pencil } from 'lucide-react';
import { userAPI } from '@/services/api';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

const createEmptyForm = () => ({
  name: '',
  age: '',
  gender: 'male',
  email: '',
  countryCode: '+1',
  phoneNumber: '',
  imageUrls: [],
});

function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(createEmptyForm);
  const [editingId, setEditingId] = useState(null);
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    fetchUsers();
  }, []);

  const totalImages = useMemo(
    () => users.reduce((sum, user) => sum + (user.imageUrls?.length || 0), 0),
    [users]
  );

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

  const handleInputChange = (event) => {
    const { name, value } = event.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name, value) => {
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleAddImageUrl = () => {
    const trimmed = imageUrl.trim();
    if (!trimmed) return;

    setFormData((prev) => ({
      ...prev,
      imageUrls: [...prev.imageUrls, trimmed],
    }));
    setImageUrl('');
  };

  const handleRemoveImageUrl = (index) => {
    setFormData((prev) => ({
      ...prev,
      imageUrls: prev.imageUrls.filter((_, idx) => idx !== index),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
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
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    try {
      await userAPI.delete(id);
      toast.success('User deleted');
      fetchUsers();
    } catch (error) {
      toast.error(`Failed to delete user: ${error.message}`);
    }
  };

  const resetForm = () => {
    setFormData(createEmptyForm());
    setEditingId(null);
    setImageUrl('');
    setShowForm(false);
  };

  if (loading) {
    return (
      <div className="flex min-h-[45vh] flex-col items-center justify-center gap-3 text-foreground/60">
        <UsersIcon className="h-8 w-8 animate-spin text-foreground/40" />
        <p className="text-sm uppercase tracking-[0.2em] text-foreground/40">
          Loading users
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">
            User Management
          </h2>
          <p className="mt-1 text-sm text-foreground/60">
            Maintain the personas that fuel your fine-tuned models.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="hidden sm:inline-flex bg-foreground/10 text-foreground/70">
            {users.length} users
          </Badge>
          <Badge className="hidden sm:inline-flex bg-foreground/10 text-foreground/70">
            {totalImages} training images
          </Badge>
          <Button onClick={() => setShowForm((prev) => !prev)} className="gap-2">
            <UserPlus className="h-4 w-4" />
            {showForm ? 'Close form' : 'Add user'}
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingId ? 'Edit user' : 'Create new user'}</CardTitle>
            <CardDescription>
              Keep user details and reference photos organised before kicking off a training run.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="grid-responsive">
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="name">Name *</Label>
                  <Input
                    id="name"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    placeholder="Jane Doe"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="age">Age *</Label>
                  <Input
                    id="age"
                    type="number"
                    name="age"
                    value={formData.age}
                    onChange={handleInputChange}
                    min={1}
                    max={150}
                    required
                    placeholder="28"
                  />
                </div>
                <div className="grid gap-2">
                  <Label>Gender *</Label>
                  <Select
                    value={formData.gender}
                    onValueChange={(value) => handleSelectChange('gender', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    placeholder="jane@example.com"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="countryCode">Country code *</Label>
                  <Input
                    id="countryCode"
                    name="countryCode"
                    value={formData.countryCode}
                    onChange={handleInputChange}
                    required
                    placeholder="+1"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phoneNumber">Phone number *</Label>
                  <Input
                    id="phoneNumber"
                    name="phoneNumber"
                    value={formData.phoneNumber}
                    onChange={handleInputChange}
                    required
                    placeholder="1234567890"
                  />
                </div>
              </div>

              <div className="grid gap-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="grid gap-2">
                    <Label htmlFor="imageUrl">Training image URL</Label>
                    <Input
                      id="imageUrl"
                      type="url"
                      value={imageUrl}
                      onChange={(event) => setImageUrl(event.target.value)}
                      placeholder="https://assets.domain.com/photo.jpg"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    className="h-11 sm:mt-6"
                    onClick={handleAddImageUrl}
                  >
                    Add URL
                  </Button>
                </div>

                {formData.imageUrls.length > 0 && (
                  <div className="grid gap-2 rounded-xl border border-border/60 bg-muted p-4">
                    <p className="text-xs uppercase tracking-[0.25em] text-foreground/40">
                      Attached images ({formData.imageUrls.length})
                    </p>
                    <div className="grid gap-2">
                      {formData.imageUrls.map((url, index) => (
                        <div
                          key={url + index}
                          className="flex min-w-0 items-center justify-between gap-4 rounded-lg border border-border/40 bg-card px-3 py-2 text-sm text-foreground/70"
                        >
                          <span className="flex-1 truncate">{url}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-8 px-2 text-xs text-red-300 hover:bg-red-500/10 hover:text-red-200"
                            onClick={() => handleRemoveImageUrl(index)}
                          >
                            Remove
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  className="sm:w-auto"
                  onClick={resetForm}
                >
                  Cancel
                </Button>
                <Button type="submit" className="sm:w-auto">
                  {editingId ? 'Update user' : 'Create user'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {users.map((user) => (
          <Card key={user._id} className="flex flex-col justify-between">
            <CardHeader className="flex flex-row items-start justify-between space-y-0">
              <div className="space-y-1">
                <CardTitle className="text-lg">{user.name}</CardTitle>
                <CardDescription className="flex items-center gap-2 text-xs uppercase text-foreground/40">
                  <UsersIcon className="h-3.5 w-3.5" />
                  Member
                </CardDescription>
              </div>
              <Badge variant="outline" className="text-xs">
                {user.imageUrls?.length || 0} images
              </Badge>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-2 text-sm text-foreground/70">
                <p className="flex items-center gap-2">
                  <UserCircle2 className="h-4 w-4 text-foreground/50" />
                  <span>{user.gender} · {user.age}</span>
                </p>
                <p className="truncate text-foreground/60">{user.email}</p>
                <p className="text-foreground/60">
                  {user.countryCode} {user.phoneNumber}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => handleEdit(user)}
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="gap-1"
                  onClick={() => handleDelete(user._id)}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {users.length === 0 && (
        <Card className="border-dashed border-border/50 bg-card text-center">
          <CardContent className="space-y-3 py-14">
            <UserCircle2 className="mx-auto h-10 w-10 text-foreground/30" />
            <h3 className="text-lg font-medium text-foreground">
              No users yet
            </h3>
            <p className="text-sm text-foreground/55">
              Add your first persona to start fine-tuning your models.
            </p>
            <Button onClick={() => setShowForm(true)} className="mt-3">
              <UserPlus className="mr-2 h-4 w-4" />
              Add user
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default Users;
