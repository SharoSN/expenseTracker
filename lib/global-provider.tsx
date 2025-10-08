import React, {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect
} from "react";

import { account, getFullUserData } from "./appwrite";
import { useAppwrite } from "./useAppwrite";

interface GlobalContextType {
  isLogged: boolean;
  user: User | null;
  loading: boolean;
  refetch: () => void;
  setUser: (user: User | null) => void;
}

interface User {
  $id: string;
  name: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string;
}

const GlobalContext = createContext<GlobalContextType | undefined>(undefined);

interface GlobalProviderProps {
  children: ReactNode;
}

export const GlobalProvider = ({ children }: GlobalProviderProps) => {
  const [user, setUser] = useState<User | null>(null); // Use a local state for user

  const {
    data: initialUserData,
    loading,
    refetch
  } = useAppwrite({
    fn: getFullUserData
  });

  useEffect(() => {
    if (initialUserData) {
      const transformedUser: User = {
        $id: initialUserData.$id,
        name: initialUserData.name,
        email: initialUserData.email,
        firstName: initialUserData.firstName,
        lastName: initialUserData.lastName,
        avatarUrl: initialUserData.avatarUrl
      };
      setUser(transformedUser);
    }
  }, [initialUserData]);

  const isLogged = !!user;

  const logoutUser = async () => {
    try {
      await account.deleteSession("current");
      setUser(null);
      return true;
    } catch (error) {
      console.log("Error logging out:", error);
      return false;
    }
  };

  return (
    <GlobalContext.Provider
      value={{
        isLogged,
        user,
        loading,
        refetch,
        setUser,
        logoutUser
      }}
    >
      {children}
    </GlobalContext.Provider>
  );
};

export const useGlobalContext = (): GlobalContextType => {
  const context = useContext(GlobalContext);
  if (!context)
    throw new Error("useGlobalContext must be used within a GlobalProvider");

  return context;
};

export default GlobalProvider;
