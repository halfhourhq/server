export function letter_sequence(pairs = 3){
  if(pairs <= 0){ pairs = 1 }
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  const pair_array: Array<string> = []

  for (let i = 0; i < pairs; i++){
    const values = crypto.getRandomValues(new Uint8Array(2))
    let pair_string = ''
    for (let i = 0; i < 2; i++) {
      pair_string += alphabet[values[i] % alphabet.length];
    }
    pair_array.push(pair_string)
  }

  return pair_array.join('_')
}