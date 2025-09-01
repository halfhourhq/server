export async function diceware(length: number): Promise<string[]> {
  const wordstext = await Deno.readTextFile('./misc/wordlist.json')
  const words = JSON.parse(wordstext)
  const set: string[] = []

  while(set.length < length){
    const charset = '123456'
    let dice = ''
    const randomValues = crypto.getRandomValues(new Uint8Array(5))
    for(let i = 0; i < 5; i++){
      dice += charset[randomValues[i]% charset.length] 
    }
    set.push(dice)
  }

  const phrase: string[] = set.map(value => {
    return words[value]
  })
  return phrase
}