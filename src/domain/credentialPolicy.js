// Match the database boundary in Unicode characters and UTF-8 bytes.
export function credentialPasswordError(value){
 if(typeof value!=='string'||Array.from(value).length<8)return 'Use a password with at least 8 characters.'
 if(new TextEncoder().encode(value).length>72)return 'This password is too long. Use fewer characters, especially when using symbols.'
 return null
}
