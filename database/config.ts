import Surreal from "@surrealdb/surrealdb"

export const db = await getSurreal()

async function getSurreal(): Promise<Surreal> {
  const url = Deno.env.get('DB_URL')
  const user = Deno.env.get('DB_USER')
  const pass = Deno.env.get('DB_PASS')
  const namespace = Deno.env.get('DB_NS')
  const database = Deno.env.get('DB_DB')
  const connection = new Surreal()
  if(!url || !user || !pass || !namespace || !database){
    await connection.close()
    throw new Error('Database connection not established: DB_URL, DB_USER, DB_PASS, DB_NS & DB_DB variables must be provided.')
  }

  try {
    await connection.connect(url, {
      auth: {
        password: pass,
        username: user
      },
      namespace: namespace,
      database: database
    })
    console.log('Database successfully connected to '+namespace+' namespace and '+database+' database.')
    return connection
  } catch (error) {
    console.log('Database connection error: ', error)
    await connection.close()
    throw new Error('Failed to connect to database', { cause: error })
  }
}