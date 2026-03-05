import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { collection, getDocs, doc, setDoc, updateDoc, deleteDoc, getDoc, Timestamp, query, orderBy, writeBatch, where } from "firebase/firestore";
import { db, authReady, auth, firebaseEnabled } from "@/lib/firebase";
import type { AuctionHouse } from "@/types/quote";

const AUCTION_HOUSES_COLLECTION = "auctionHouses";

export function useAuctionHouses() {
  const queryClient = useQueryClient();

  // Charger les salles de ventes depuis Firestore
  const { data: houses = [], isLoading, isError } = useQuery<AuctionHouse[]>({
    queryKey: ["auctionHouses"],
    queryFn: async () => {
      console.log("[useAuctionHouses] 🔍 Début du chargement...");
      
      if (!firebaseEnabled) {
        console.warn("[useAuctionHouses] ⚠️ Firebase non configuré");
        return [];
      }

      await authReady;
      if (!auth.currentUser) {
        console.warn("[useAuctionHouses] ⚠️ Utilisateur non authentifié");
        return [];
      }

      console.log("[useAuctionHouses] ✅ Utilisateur authentifié:", auth.currentUser.uid);

      try {
        // Récupérer le saasAccountId de l'utilisateur
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        const saasAccountId = userDoc.exists() ? userDoc.data()?.saasAccountId : null;
        
        console.log("[useAuctionHouses] 📊 saasAccountId:", saasAccountId);

        // Charger TOUTES les salles pour diagnostiquer
        const allHousesQuery = query(collection(db, AUCTION_HOUSES_COLLECTION), orderBy("name"));
        const allSnapshot = await getDocs(allHousesQuery);
        
        console.log("[useAuctionHouses] 📦 Nombre total de salles dans Firestore:", allSnapshot.size);
        
        const housesList: AuctionHouse[] = [];
        const allHousesList: any[] = [];

        allSnapshot.forEach((docSnap) => {
          // Ignorer le document _meta
          if (docSnap.id === "_meta") return;

          const data = docSnap.data();
          allHousesList.push({
            id: docSnap.id,
            name: data.name,
            saasAccountId: data.saasAccountId,
            email: data.email
          });
          
          // Filtrer par saasAccountId SI le champ existe
          // Sinon, inclure toutes les salles (pour compatibilité avec anciennes données)
          const shouldInclude = !data.saasAccountId || (saasAccountId && data.saasAccountId === saasAccountId);
          
          if (shouldInclude) {
            housesList.push({
              id: docSnap.id,
              name: data.name || "",
              address: data.address || "",
              contact: data.contact || "",
              email: data.email || undefined,
              website: data.website || undefined,
              mbeCustomerId: data.mbeCustomerId || undefined,
            });
          }
        });

        console.log("[useAuctionHouses] 📋 Toutes les salles:", allHousesList);
        console.log("[useAuctionHouses] ✅ Salles filtrées pour ce compte:", housesList.length, housesList.map(h => ({ name: h.name, email: h.email })));
        
        return housesList;
      } catch (error) {
        console.error("[useAuctionHouses] ❌ Erreur lors du chargement:", error);
        return [];
      }
    },
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  // Log pour voir ce que React Query retourne réellement
  console.log("[useAuctionHouses] 📊 React Query returned data:", {
    housesLength: houses.length,
    isLoading,
    isError,
    housesData: houses.map(h => ({ name: h.name, email: h.email }))
  });

  // Ajouter une salle de ventes
  const addHouseMutation = useMutation({
    mutationFn: async (house: Omit<AuctionHouse, "id">) => {
      if (!firebaseEnabled) {
        throw new Error("Firebase non configuré");
      }

      await authReady;
      if (!auth.currentUser) {
        throw new Error("Utilisateur non authentifié");
      }

      // Récupérer le saasAccountId de l'utilisateur
      const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
      const saasAccountId = userDoc.exists() ? userDoc.data()?.saasAccountId : null;

      const newHouseRef = doc(collection(db, AUCTION_HOUSES_COLLECTION));
      const houseData = {
        ...house,
        saasAccountId, // Ajouter le saasAccountId pour l'isolation
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      };

      await setDoc(newHouseRef, houseData);
      console.log("[useAuctionHouses] ✅ Salle de ventes ajoutée:", newHouseRef.id, "pour saasAccountId:", saasAccountId);

      // Associer automatiquement les devis correspondants à cette salle de ventes
      let associatedCount = 0;
      try {
        associatedCount = await associateQuotesToAuctionHouse(house.name);
      } catch (error) {
        console.warn("[useAuctionHouses] ⚠️ Impossible d'associer les devis:", error);
        // Ne pas faire échouer l'ajout de la salle de ventes si l'association échoue
      }

      return { id: newHouseRef.id, ...house, associatedQuotesCount: associatedCount };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auctionHouses"] });
    },
  });

  // Mettre à jour une salle de ventes (ex: mbeCustomerId)
  const updateHouseMutation = useMutation({
    mutationFn: async ({ houseId, updates }: { houseId: string; updates: Partial<Omit<AuctionHouse, "id">> }) => {
      if (!firebaseEnabled) {
        throw new Error("Firebase non configuré");
      }

      await authReady;
      if (!auth.currentUser) {
        throw new Error("Utilisateur non authentifié");
      }

      const houseRef = doc(db, AUCTION_HOUSES_COLLECTION, houseId);
      const updateData = {
        ...updates,
        updatedAt: Timestamp.now(),
      };
      await updateDoc(houseRef, updateData);
      console.log("[useAuctionHouses] ✅ Salle mise à jour:", houseId);
      return { id: houseId, ...updates };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auctionHouses"] });
    },
  });

  // Supprimer une salle de ventes
  const deleteHouseMutation = useMutation({
    mutationFn: async (houseId: string) => {
      if (!firebaseEnabled) {
        throw new Error("Firebase non configuré");
      }

      await authReady;
      if (!auth.currentUser) {
        throw new Error("Utilisateur non authentifié");
      }

      await deleteDoc(doc(db, AUCTION_HOUSES_COLLECTION, houseId));
      console.log("[useAuctionHouses] ✅ Salle de ventes supprimée:", houseId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["auctionHouses"] });
    },
  });

  return {
    houses,
    isLoading,
    isError,
    addHouse: addHouseMutation.mutateAsync,
    updateHouse: updateHouseMutation.mutateAsync,
    deleteHouse: deleteHouseMutation.mutateAsync,
    isAdding: addHouseMutation.isPending,
    isDeleting: deleteHouseMutation.isPending,
  };
}

/**
 * Associe automatiquement les devis à leur salle de ventes dans Firestore
 * Cette fonction met à jour les devis qui ont le nom de la salle de ventes dans leur lot.auctionHouse
 * Les devis sont automatiquement classés dans cette salle de ventes pour les collectes
 * @returns Le nombre de devis associés
 */
async function associateQuotesToAuctionHouse(auctionHouseName: string): Promise<number> {
  if (!firebaseEnabled) {
    console.warn("[associateQuotesToAuctionHouse] Firebase non configuré");
    return 0;
  }

  await authReady;
  if (!auth.currentUser) {
    console.warn("[associateQuotesToAuctionHouse] Utilisateur non authentifié");
    return 0;
  }

  try {
    // Rechercher les devis qui ont cette salle de ventes dans leur lot.auctionHouse
    // On cherche dans auctionSheet.auctionHouse (depuis le bordereau) ou lotEnriched.auctionHouse
    const quotesRef = collection(db, "quotes");
    const snapshot = await getDocs(quotesRef);
    
    const batch = writeBatch(db);
    let updatedCount = 0;
    const batchSize = 500; // Limite Firestore pour les batch writes
    let currentBatch = batch;
    let batchCount = 0;

    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      // Chercher dans plusieurs emplacements possibles pour trouver le nom de la salle de ventes
      const quoteAuctionHouse = 
        data.auctionSheet?.auctionHouse || 
        data.lotEnriched?.auctionHouse ||
        data.lotAuctionHouse;
      
      // Si le devis correspond à cette salle de ventes (comparaison insensible à la casse)
      const matches = quoteAuctionHouse && 
        quoteAuctionHouse.toString().trim().toLowerCase() === auctionHouseName.trim().toLowerCase();
      
      if (matches) {
        currentBatch.update(docSnap.ref, {
          auctionHouseName: auctionHouseName, // Stocker le nom normalisé de la salle de ventes
          updatedAt: Timestamp.now(),
        });
        updatedCount++;
        batchCount++;

        // Si on atteint la limite du batch, commit et créer un nouveau batch
        if (batchCount >= batchSize) {
          // Note: On ne peut pas commit un batch dans un forEach, donc on va commit après
          batchCount = 0;
        }
      }
    });

    if (updatedCount > 0) {
      await currentBatch.commit();
      console.log(`[associateQuotesToAuctionHouse] ✅ ${updatedCount} devis associés à "${auctionHouseName}"`);
    } else {
      console.log(`[associateQuotesToAuctionHouse] ℹ️ Aucun devis trouvé pour "${auctionHouseName}"`);
      console.log(`[associateQuotesToAuctionHouse] 💡 Les devis seront automatiquement classés si leur lot.auctionHouse correspond au nom de la salle`);
    }
    
    return updatedCount;
  } catch (error) {
    console.error("[associateQuotesToAuctionHouse] ❌ Erreur:", error);
    // Ne pas faire échouer l'ajout de la salle de ventes si l'association échoue
    console.warn("[associateQuotesToAuctionHouse] ⚠️ L'association des devis a échoué, mais la salle de ventes a été créée");
    return 0;
  }
}

