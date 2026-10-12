import { compare } from 'bcrypt';
describe('seeded admin password compatibility',()=>{it('accepts MariaDB seed $2y$ bcrypt hashes after normalization',async()=>{const seed='$2y$10$nfTYN1Hwj45ZVjCM1L7TaOabz9E0Mi1rDsbDYWjxbszvdLrMh8mES';expect(await compare('Admin@123456',seed.replace(/^\$2y\$/,'$2b$'))).toBe(true);});});
