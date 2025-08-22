import { diceware } from "./diceware.util.ts";

export async function sanitise_name(filename: string) {
  const lastDotIndex = filename.lastIndexOf('.')
  let name = filename
  let extension = ''

  if (lastDotIndex !== -1) {
    name = filename.substring(0, lastDotIndex)
    extension = filename.substring(lastDotIndex)
  }
  const random_word = await diceware(1)
  const sanitised_name = name.replace(/[^a-zA-Z0-9]/g, '_')
  const sanitised_unique_name = sanitised_name+`_${random_word.toString()}`

  return {
    storage_name: sanitised_unique_name + extension,
    display_name: sanitised_name + extension,
  }
}