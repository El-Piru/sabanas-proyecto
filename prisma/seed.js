const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  console.log('Iniciando carga de cabañas reales (seed)...')

  const cabanasReales = [
    {
      id: 1,
      nombre: 'Cabaña 1',
      descripcion: 'Hermosa cabaña familiar para 8 personas a pasos del lago, totalmente equipada.',
      precio: 105000,
      capacidad: 8,
      imagen: '/images/cabana1.jpg',
      disponible: true
    },
    {
      id: 2,
      nombre: 'Cabaña 2',
      descripcion: 'Hermosa cabaña familiar para 8 personas, excelente iluminación y comodidad.',
      precio: 105000,
      capacidad: 8,
      imagen: '/images/cabana2.jpg',
      disponible: true
    },
    {
      id: 3,
      nombre: 'Cabaña 3',
      descripcion: 'Hermosa cabaña familiar para 8 personas, amplia terraza privada con vista al entorno.',
      precio: 105000,
      capacidad: 8,
      imagen: '/images/cabana3.jpg',
      disponible: true
    },
    {
      id: 4,
      nombre: 'Cabaña 4',
      descripcion: 'Hermosa cabaña familiar para 8 personas, con excelente distribución y espacios.',
      precio: 105000,
      capacidad: 8,
      imagen: '/images/cabana4.jpg',
      disponible: true
    },
    {
      id: 5,
      nombre: 'Cabaña 5',
      descripcion: 'Acogedora cabaña para 6 personas, ideal para grupos medianos, totalmente equipada.',
      precio: 85000,
      capacidad: 6,
      imagen: '/images/cabana5.jpg',
      disponible: true
    },
    {
      id: 6,
      nombre: 'Cabaña 6',
      descripcion: 'Acogedora cabaña para 6 personas, equipamiento moderno y cercanía a la piscina.',
      precio: 85000,
      capacidad: 6,
      imagen: '/images/cabana6.jpg',
      disponible: true
    },
    {
      id: 7,
      nombre: 'Cabaña 7',
      descripcion: 'Amplia y espaciosa cabaña para 10 personas, ideal para familias grandes, máximo confort.',
      precio: 125000,
      capacidad: 10,
      imagen: '/images/cabana7.jpg',
      disponible: true
    },
    {
      id: 8,
      nombre: 'Cabaña 8',
      descripcion: 'Amplia y espaciosa cabaña para 10 personas, equipamiento completo y terraza familiar.',
      precio: 125000,
      capacidad: 10,
      imagen: '/images/cabana8.jpg',
      disponible: true
    },
    {
      id: 9,
      nombre: 'Cabaña 9',
      descripcion: 'Acogedora cabaña para 6 personas, rodeada de áreas verdes para disfrutar el descanso.',
      precio: 85000,
      capacidad: 6,
      imagen: '/images/cabana9.jpg',
      disponible: true
    },
    {
      id: 10,
      nombre: 'Cabaña 10',
      descripcion: 'Cómoda cabaña para 4 personas, excelente ambiente y privacidad para parejas o grupos chicos.',
      precio: 65000,
      capacidad: 4,
      imagen: '/images/cabana10.jpg',
      disponible: true
    },
    {
      id: 11,
      nombre: 'Cabaña 11',
      descripcion: 'Acogedora cabaña para 2 personas, excelente ambiente y privacidad, totalmente equipada.',
      precio: 45000,
      capacidad: 2,
      imagen: '/images/cabana11.jpg',
      disponible: true
    }
  ]

  for (const c of cabanasReales) {
    const cabanaUpsert = await prisma.cabana.upsert({
      where: { id: c.id },
      update: {
        nombre: c.nombre,
        descripcion: c.descripcion,
        precio: c.precio,
        capacidad: c.capacidad,
        imagen: c.imagen,
        disponible: c.disponible
      },
      create: {
        id: c.id,
        nombre: c.nombre,
        descripcion: c.descripcion,
        precio: c.precio,
        capacidad: c.capacidad,
        imagen: c.imagen,
        disponible: c.disponible
      }
    })
    console.log(`Cabaña cargada/actualizada: ${cabanaUpsert.nombre} (Capacidad: ${cabanaUpsert.capacidad}, Precio: $${cabanaUpsert.precio})`)
  }

  console.log('¡Carga de cabañas completada con éxito!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
