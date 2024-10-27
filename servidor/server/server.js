import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import path from 'path';
import multer from 'multer';
import fs from 'fs';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs'; // Importar bcrypt para encriptar contraseñas

const app = express();
const port = process.env.PORT || 10000; // Cambiado para usar el puerto de Render

// ***** CONFIGURACIÓN DE DIRECTORIOS Y ARCHIVOS JSON *****

// Obtener el directorio actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Archivos JSON
const usuariosFilePath = path.join(__dirname, '../data/usuarios.json');
const publicacionesFilePath = path.join(__dirname, '../data/publicaciones.json');

// ***** FUNCIONES DE MANEJO DE ARCHIVOS JSON *****

// Función para leer datos de un archivo JSON
const readJsonFile = (filePath) => {
  if (!fs.existsSync(filePath)) {
    return []; // Devuelve un array vacío si el archivo no existe
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
};

// Función para escribir datos en un archivo JSON
const writeJsonFile = (filePath, data) => {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
};

// Leer usuarios y publicaciones desde los archivos JSON
let usuarios = readJsonFile(usuariosFilePath);
let publicaciones = readJsonFile(publicacionesFilePath);

// ***** MIDDLEWARES Y CONFIGURACIÓN DE CORS *****

app.use(cors());
app.use(bodyParser.json()); // Parsear el cuerpo de las solicitudes como JSON
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // Servir archivos estáticos

// Verificar y crear la carpeta 'uploads' si no existe
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// ***** CONFIGURACIÓN DE MULTER PARA SUBIDA DE IMÁGENES *****

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadsDir); // Carpeta de destino
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname); // Nombre único
  }
});
const upload = multer({ storage: storage });

// =========================================
// ***** SECCIÓN DE INICIO DE SESIÓN *****
// =========================================

/**
 * ***** OBTENER TODOS LOS USUARIOS *****
 * GET /api/usuarios
 */
app.get('/api/usuarios', (req, res) => {
  res.json(usuarios);
});

/**
 * ***** REGISTRAR NUEVO USUARIO *****
 * POST /api/usuarios
 */
app.post('/api/usuarios', async (req, res) => {
  const { username, password } = req.body;

  // Verificar si el usuario ya existe
  const existingUser = usuarios.find(u => u.username === username);
  if (existingUser) {
    return res.status(400).json({ message: 'El usuario ya existe' });
  }

  // Encriptar la contraseña
  const saltRounds = 10;
  try {
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    usuarios.push({ username, password: hashedPassword });
    writeJsonFile(usuariosFilePath, usuarios); // Guardar el usuario

    res.status(201).json({ message: 'Usuario creado exitosamente' });
  } catch (error) {
    res.status(500).json({ message: 'Error al crear el usuario', error });
  }
});

/**
 * ***** INICIO DE SESIÓN *****
 * POST /api/login
 */
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;

  // Buscar al usuario
  const user = usuarios.find(u => u.username === username);
  if (!user) {
    return res.status(400).json({ message: 'El usuario no existe' });
  }

  // Verificar la contraseña
  try {
    const match = await bcrypt.compare(password, user.password);
    if (match) {
      return res.status(200).json({ message: 'Inicio de sesión exitoso' });
    } else {
      return res.status(400).json({ message: 'Contraseña incorrecta' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Error al verificar la contraseña', error });
  }
});

// =========================================
// ***** SECCIÓN DE PUBLICACIONES *****
// =========================================

/**
 * ***** OBTENER TODAS LAS PUBLICACIONES *****
 * GET /api/publicaciones
 */
app.get('/api/publicaciones', (req, res) => {
  res.json(publicaciones);
});

/**
 * ***** SUBIR UNA NUEVA PUBLICACIÓN *****
 * POST /api/upload
 */
app.post('/api/upload', upload.single('image'), (req, res) => {
  const { username, description, imageName } = req.body;

  if (!req.file) {
    return res.status(400).json({ message: 'Error al subir la imagen' });
  }

  // Crear la nueva publicación
  const nuevaPublicacion = {
    imagePath: `http://${req.headers.host}/uploads/${req.file.filename}`, // Corregido para usar comillas invertidas
    imageName,
    description,
    username
  };

  publicaciones.push(nuevaPublicacion);
  writeJsonFile(publicacionesFilePath, publicaciones); // Guardar la publicación

  res.status(201).json({
    message: 'Imagen subida exitosamente',
    nuevaPublicacion
  });
});

// =========================================
// ***** OTRAS RUTAS *****
// =========================================

/**
 * ***** OBTENER USUARIOS Y PUBLICACIONES *****
 * GET /api/data
 */
app.get('/api/data', (req, res) => {
  res.json({ usuarios, publicaciones });
});

/**
 * ***** RUTA RAÍZ *****
 * GET /
 */
app.get('/', (req, res) => {
  res.json({ usuarios, publicaciones, likes }); // Asegúrate de que 'likes' esté definido
});

/**
 * ***** SERVIR PERFIL *****
 * GET /perfil
 */
app.get('/perfil', (req, res) => {
  res.sendFile(path.join(__dirname, '../src/components/perfil.astro'));
});

// =========================================
// *****  SECCION DE LIKES *****
// =========================================
// Archivos JSON
const likesFilePath = path.join(__dirname, '../data/likes.json');
let likes = readJsonFile(likesFilePath);

/**
 * ***** OBTENER PUBLICACIONES CON LIKE DE UN USUARIO *****
 * GET /api/likes/:username
 */
app.get('/api/likes/:username', (req, res) => {
  const { username } = req.params;

  // Buscar las publicaciones que le gustan al usuario
  const userLikes = likes.find(like => like.username === username);

  if (!userLikes) {
    return res.status(404).json({ message: 'El usuario no tiene publicaciones con like' });
  }

  res.status(200).json(userLikes.likedPublications);
});

/// Ruta para guardar una publicación en el JSON
app.post('/api/likes', (req, res) => {
  const { username, publication } = req.body;

  let userLikes = likes.find(like => like.username === username);

  if (!userLikes) {
    userLikes = { username, likedPublications: [] };
    likes.push(userLikes);
  }

  // Verifica si la publicación ya está guardada
  const alreadyLiked = userLikes.likedPublications.some(
    (likedPub) =>
      likedPub.imagePath === publication.imagePath &&
      likedPub.imageName === publication.imageName
  );

  if (alreadyLiked) {
    return res.status(400).json({ message: 'La publicación ya está guardada.' });
  }

  // Agrega la publicación a la lista de publicaciones que le gustan
  userLikes.likedPublications.push(publication);

  fs.writeFileSync(likesFilePath, JSON.stringify(likes, null, 2));

  res.status(201).json({ message: 'Publicación guardada exitosamente.' });
});

/// Ruta para eliminar un like de un usuario
app.delete('/api/likes', (req, res) => {
  const { username, publication } = req.body;

  // Encuentra al usuario en el arreglo de likes
  const userLikes = likes.find(like => like.username === username);

  if (!userLikes) {
    return res.status(404).json({ message: 'No se encontró el usuario.' });
  }

  // Busca la publicación en los likes del usuario
  const publicationIndex = userLikes.likedPublications.findIndex(
    (pub) => pub.imagePath === publication.imagePath && pub.imageName === publication.imageName
  );

  if (publicationIndex === -1) {
    return res.status(404).json({ message: 'No se encontró la publicación en los likes del usuario.' });
  }

  // Elimina la publicación
  userLikes.likedPublications.splice(publicationIndex, 1);

  // Escribe el nuevo estado de likes en el archivo JSON
  fs.writeFileSync(likesFilePath, JSON.stringify(likes, null, 2));

  res.status(200).json({ message: 'Like eliminado exitosamente.' });
});



app.delete('/api/publicaciones', (req, res) => {
  const { username, publication } = req.body;

  // Busca el índice de la publicación que se desea eliminar
  const publicationIndex = publicaciones.findIndex(pub =>
    pub.imagePath === publication.imagePath && pub.imageName === publication.imageName
  );

  if (publicationIndex === -1) {
    return res.status(404).json({ message: 'Publicación no encontrada.' });
  }

  // Elimina la publicación
  publicaciones.splice(publicationIndex, 1);

  // Elimina la publicación de los likes de todos los usuarios
  likes.forEach(like => {
    like.likedPublications = like.likedPublications.filter(likePublication => 
      likePublication.imagePath !== publication.imagePath || likePublication.imageName !== publication.imageName
    );
  });

  // Escribe el nuevo estado en el archivo JSON
  writeJsonFile(publicacionesFilePath, publicaciones);
  writeJsonFile(likesFilePath, likes);

  res.status(200).json({ message: 'Publicación eliminada exitosamente.' });
});

// =========================================
// ***** INICIAR EL SERVIDOR *****
// =========================================

app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`); // Corregido para usar comillas invertidas
});
