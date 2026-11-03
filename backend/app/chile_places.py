"""Lugares sin inventario: el catálogo solo tiene comunas de la Región Metropolitana.

Se escriben sin tildes y en minúscula, como las compara properties_search. Quedan fuera,
a propósito, los nombres que también son calles o barrios de Santiago (Yungay, Lautaro,
Victoria, Coronel, San Carlos, Los Andes...): detectarlos como "otra ciudad" taparía una
búsqueda legítima en la RM. Para esos, la comuna se sigue resolviendo como hasta ahora.
"""

NON_RM_PLACES = (
    # Arica y Parinacota, Tarapacá, Antofagasta, Atacama, Coquimbo
    "arica", "putre", "iquique", "alto hospicio", "pozo almonte", "antofagasta", "calama",
    "tocopilla", "mejillones", "taltal", "san pedro de atacama", "maria elena", "copiapo",
    "caldera", "vallenar", "chanaral", "tierra amarilla", "huasco", "diego de almagro",
    "la serena", "ovalle", "illapel", "los vilos", "salamanca", "vicuna",
    "andacollo", "monte patria", "combarbala", "punitaqui", "paihuano",
    # Valparaíso
    "valparaiso", "vina del mar", "quilpue", "villa alemana", "concon", "quillota", "la calera", "limache", "olmue", "san felipe", "algarrobo",
    "el quisco", "el tabo", "cartagena", "zapallar", "papudo", "la ligua",
    "puchuncavi", "quintero", "isla de pascua", "rapa nui", "juan fernandez", "renaca", "cachagua", "maitencillo",
    # O'Higgins, Maule, Ñuble
    "rancagua", "machali", "rengo", "pichilemu", "graneros", "mostazal",
    "requinoa", "talca", "curico", "linares", "cauquenes", "parral", "san clemente",
    "villa alegre", "chillan", "chillan viejo", "quillon", "coihueco", "quirihue",
    "coelemu", "cobquecura",
    # Biobío y Araucanía
    "concepcion", "talcahuano", "san pedro de la paz", "chiguayante", "hualpen", "penco", "hualqui", "canete", "curanilahue", "lebu", "los angeles", "mulchen",
    "nacimiento", "laja", "cabrero", "temuco", "padre las casas", "villarrica", "pucon",
    "angol", "nueva imperial", "carahue", "pitrufquen", "gorbea", "loncoche", "traiguen",
    "curacautin", "lonquimay", "cunco", "vilcun", "melipeuco",
    # Los Ríos, Los Lagos, Aysén, Magallanes
    "valdivia", "rio bueno", "panguipulli", "paillaco", "lanco", "futrono",
    "lago ranco", "puerto montt", "puerto varas", "osorno", "ancud", "quellon",
    "frutillar", "llanquihue", "calbuco", "maullin", "purranque", "puyehue", "dalcahue",
    "chonchi", "hualaihue", "chaiten", "futaleufu", "palena", "cochamo", "los muermos",
    "coyhaique", "puerto aysen", "chile chico", "cochrane", "puerto cisnes", "punta arenas",
    "puerto natales", "porvenir", "puerto williams", "torres del paine",
    # Regiones y zonas
    "araucania", "biobio", "nuble", "aysen", "magallanes", "tarapaca",
    "patagonia", "chiloe", "los lagos", "los rios", "region de valparaiso",
    "region del biobio", "region de coquimbo", "region de los lagos", "region del maule",
    # Fuera de Chile
    "miami", "orlando", "nueva york", "new york", "buenos aires", "bogota", "medellin", "cancun", "punta cana", )

# Topónimos de la RM que contienen un nombre de arriba: se quitan antes de buscar.
PLACE_FALSE_FRIENDS = ("pedro de valdivia", "la concepcion", "inmaculada concepcion")
