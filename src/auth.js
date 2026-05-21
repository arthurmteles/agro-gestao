// Usuário master padrão — altere a senha após o primeiro acesso
export const DEFAULT_USERS = [
  {
    id: 1,
    username: "master",
    password: "admin123",
    role: "master",
    name: "Administrador",
    properties: "all",
  }
];

export const hashPassword = (password) => {
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString();
};

export const authenticate = (users, username, password) => {
  const hashed = hashPassword(password);
  return users.find(
    u => u.username === username && u.password === hashed
  ) || null;
};

export const canEdit = (role) => role === "master" || role === "operador";
export const canDelete = (role) => role === "master";
export const canViewReports = (role) => role === "master";
export const canManageUsers = (role) => role === "master";

export const filterPropertiesByUser = (properties, user) => {
  if (!user) return [];
  if (user.properties === "all") return properties;
  return properties.filter(p => (user.properties || []).includes(p.id));
};