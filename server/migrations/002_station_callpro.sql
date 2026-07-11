-- Station assignment: which airport the staff member works at.
-- UB = Chinggis Khaan Intl (Ulaanbaatar), OT = Khanbumbat (Oyu Tolgoi).
ALTER TABLE users ADD COLUMN IF NOT EXISTS station VARCHAR(8);
