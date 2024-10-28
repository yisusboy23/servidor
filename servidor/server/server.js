import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const app = express();
const port = process.env.PORT || 10000;

// ***** CONFIGURACIÓN DE DIRECTORIOS *****
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Definir directorios persistentes en Render
const PERSISTENT_DIR = process.env.RENDER_ENV 
  ? '/var/data'  // Directorio persistente en Render
  : path.join(__dirname, 'data'); // Directorio local para desarrollo

const DATA_DIR = path.join(PERSISTENT_DIR, 'data');
const UPLOADS_DIR = path.join(PERSISTENT_DIR, 'uploads');

// Crear directorios si no existen
[DATA_DIR, UPLOADS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      console.log(`Directorio creado: ${dir}`);
    } catch (error) {
      console.error(`Error al crear directorio ${dir}:`, error);
    }
  }
});

// Actualizar rutas de archivos JSON
const usuariosFilePath = path.join(DATA_DIR, 'usuarios.json');
const publicacionesFilePath = path.join(DATA_DIR, 'publicaciones.json');
const likesFilePath = path.join(DATA_DIR, 'likes.json');

// ***** FUNCIONES DE MANEJO DE ARCHIVOS JSON *****
const readJsonFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    writeJsonFile(filePath, []); // Crear archivo con array vacío si no existe
    console.log(`Archivo creado: ${filePath}`);
    return [];
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    console.log(`Datos cargados exitosamente de: ${filePath}`);
    return data;
  } catch (error) {
    console.error(`Error leyendo ${filePath}:`, error);
    return [];
  }
};

const writeJsonFile = (filePath, data) => {
  try {
    const dirName = path.dirname(filePath);
    if (!fs.existsSync(dirName)) {
      fs.mkdirSync(dirName, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Datos guardados exitosamente en: ${filePath}`);
  } catch (error) {
    console.error(`Error escribiendo ${filePath}:`, error);
  }
};

// Inicializar datos
let usuarios = readJsonFile(usuariosFilePath);
let publicaciones = readJsonFile(publicacionesFilePath);
let likes = readJsonFile(likesFilePath);

// ***** MIDDLEWARES Y CONFIGURACIÓN DE CORS *****
app.use(cors());
app.use(bodyParser.json());
app.use('/uploads', express.static(UPLOADS_DIR));

// ***** CONFIGURACIÓN DE MULTER *****
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Asegurarse de que el directorio existe antes de guardar
    if (!fs.existsSync(UPLOADS_DIR)) {
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    }
    cb(null, UPLOADS_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 } // Límite de 5MB
});

// ***** RUTAS DE USUARIOS *****
app.get('/api/usuarios', (req, res) => {
  res.json(usuarios);
});

app.post('/api/usuarios', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: 'Username y password son requeridos' });
  }

  const existingUser = usuarios.find(u => u.username === username);
  if (existingUser) {
    return res.status(400).json({ message: 'El usuario ya existe' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    usuarios.push({ username, password: hashedPassword });
    writeJsonFile(usuariosFilePath, usuarios);
    res.status(201).json({ message: 'Usuario creado exitosamente' });
  } catch (error) {
    console.error('Error al crear usuario:', error);
    res.status(500).json({ message: 'Error al crear el usuario' });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  const user = usuarios.find(u => u.username === username);
  if (!user) {
    return res.status(400).json({ message: 'El usuario no existe' });
  }

  try {
    const match = await bcrypt.compare(password, user.password);
    if (match) {
      return res.status(200).json({ message: 'Inicio de sesión exitoso' });
    } else {
      return res.status(400).json({ message: 'Contraseña incorrecta' });
    }
  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ message: 'Error al verificar la contraseña' });
  }
});

// ***** RUTAS DE PUBLICACIONES *****
app.get('/api/publicaciones', (req, res) => {
  res.json(publicaciones);
});

app.post('/api/upload', upload.single('image'), (req, res) => {
  const { username, description, imageName } = req.body;

  if (!req.file) {
    return res.status(400).json({ message: 'Error al subir la imagen' });
  }

  const baseUrl = 'https://servidor-c1k2.onrender.com';
  const nuevaPublicacion = {
    imagePath: `${baseUrl}/uploads/${req.file.filename}`,
    imageName,
    description,
    username,
    timestamp: Date.now()
  };

  publicaciones.push(nuevaPublicacion);
  writeJsonFile(publicacionesFilePath, publicaciones);

  res.status(201).json({
    message: 'Imagen subida exitosamente',
    nuevaPublicacion
  });
});

app.delete('/api/publicaciones', (req, res) => {
  const { username, publication } = req.body;

  const publicationIndex = publicaciones.findIndex(pub =>
    pub.imagePath === publication.imagePath && pub.imageName === publication.imageName
  );

  if (publicationIndex === -1) {
    return res.status(404).json({ message: 'Publicación no encontrada.' });
  }

  try {
    // Obtener el nombre del archivo de la URL
    const fileName = publication.imagePath.split('/').pop();
    const filePath = path.join(UPLOADS_DIR, fileName);
    
    // Eliminar el archivo si existe
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // Eliminar la publicación del array
    publicaciones.splice(publicationIndex, 1);

    // Eliminar la publicación de los likes
    likes.forEach(like => {
      like.likedPublications = like.likedPublications.filter(likePublication =>
        likePublication.imagePath !== publication.imagePath || likePublication.imageName !== publication.imageName
      );
    });

    writeJsonFile(publicacionesFilePath, publicaciones);
    writeJsonFile(likesFilePath, likes);

    res.status(200).json({ message: 'Publicación eliminada exitosamente.' });
  } catch (error) {
    console.error('Error al eliminar publicación:', error);
    res.status(500).json({ message: 'Error al eliminar la publicación' });
  }
});

// ***** RUTAS DE LIKES *****
app.get('/api/likes/:username', (req, res) => {
  const { username } = req.params;
  const userLikes = likes.find(like => like.username === username);

  if (!userLikes) {
    return res.status(404).json({ message: 'El usuario no tiene publicaciones con like' });
  }

  res.status(200).json(userLikes.likedPublications);
});

app.post('/api/likes', (req, res) => {
  const { username, publication } = req.body;

  let userLikes = likes.find(like => like.username === username);

  if (!userLikes) {
    userLikes = { username, likedPublications: [] };
    likes.push(userLikes);
  }

  const alreadyLiked = userLikes.likedPublications.some(
    (likedPub) =>
      likedPub.imagePath === publication.imagePath &&
      likedPub.imageName === publication.imageName
  );

  if (alreadyLiked) {
    return res.status(400).json({ message: 'La publicación ya está guardada.' });
  }

  userLikes.likedPublications.push(publication);
  writeJsonFile(likesFilePath, likes);

  res.status(201).json({ message: 'Publicación guardada exitosamente.' });
});

app.delete('/api/likes', (req, res) => {
  const { username, publication } = req.body;

  const userLikes = likes.find(like => like.username === username);

  if (!userLikes) {
    return res.status(404).json({ message: 'No se encontró el usuario.' });
  }

  const publicationIndex = userLikes.likedPublications.findIndex(
    (pub) => pub.imagePath === publication.imagePath && pub.imageName === publication.imageName
  );

  if (publicationIndex === -1) {
    return res.status(404).json({ message: 'No se encontró la publicación en los likes del usuario.' });
  }

  userLikes.likedPublications.splice(publicationIndex, 1);
  writeJsonFile(likesFilePath, likes);

  res.status(200).json({ message: 'Like eliminado exitosamente.' });
});

// ***** OTRAS RUTAS *****
app.get('/api/data', (req, res) => {
  res.json({ usuarios, publicaciones, likes });
});

app.get('/', (req, res) => {
  res.json({ status: 'Servidor funcionando', usuarios, publicaciones, likes });
});

// ***** INICIAR SERVIDOR *****
app.listen(port, () => {
  console.log(`Servidor iniciado en puerto ${port}`);
  console.log(`Modo: ${process.env.RENDER_ENV ? 'Producción (Render)' : 'Desarrollo local'}`);
  console.log(`Directorio persistente: ${PERSISTENT_DIR}`);
  console.log(`Directorio de datos: ${DATA_DIR}`);
  console.log(`Directorio de uploads: ${UPLOADS_DIR}`);
});