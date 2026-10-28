/** Display only; authorization must always use effective permissions. */
export const LABEL_ROLE:Readonly<Record<string,string>>={"R-01":"Administrator","R-02":"Petugas Sarpras","R-03":"Pimpinan Sekolah","R-04":"Teknisi","R-05":"Guru","R-06":"Staf/TU","R-07":"Siswa/OSIS"};
export const roleLabel=(code:string,name?:string|null):string=>name?.trim()||LABEL_ROLE[code]||"Peran khusus";
