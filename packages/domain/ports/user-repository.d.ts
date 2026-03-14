import { User } from '../entities/user';

export interface UserRepository {
  getUser(uid: string): Promise<User | null>;
  saveUser(user: User): Promise<void>;
  getUsers(): Promise<User[]>;
  deleteUser(uid: string): Promise<void>;
}
