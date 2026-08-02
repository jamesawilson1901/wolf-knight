package com.wombat.split.jobs

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class JobNamesTest {

    @Test
    fun `pool starts at echidna`() {
        assertEquals("echidna", JobNames.pool.first())
        assertEquals("echidna", JobNames.nameFor(0))
    }

    @Test
    fun `wombat is reserved for the app, never a job name`() {
        assertFalse(JobNames.pool.contains("wombat"))
        // Even across several laps of the pool, "wombat" never appears.
        val manyNames = (0 until JobNames.pool.size * 3).map(JobNames::nameFor)
        assertTrue(manyNames.none { it.startsWith("wombat") })
    }

    @Test
    fun `pool has no duplicates`() {
        assertEquals(JobNames.pool.size, JobNames.pool.toSet().size)
    }

    @Test
    fun `names wrap with a round suffix after a full lap`() {
        val size = JobNames.pool.size
        assertEquals("echidna", JobNames.nameFor(0))
        assertEquals("echidna-2", JobNames.nameFor(size))
        assertEquals("quokka-2", JobNames.nameFor(size + 1))
        assertEquals("echidna-3", JobNames.nameFor(size * 2))
    }

    @Test
    fun `next skips names already in use`() {
        assertEquals("echidna", JobNames.next(emptyList()))
        assertEquals("quokka", JobNames.next(listOf("echidna")))
        assertEquals("numbat", JobNames.next(listOf("echidna", "quokka")))
        // A full pool in use rolls into round 2.
        assertEquals("echidna-2", JobNames.next(JobNames.pool))
    }

    @Test(expected = IllegalArgumentException::class)
    fun `negative index is rejected`() {
        JobNames.nameFor(-1)
    }
}
